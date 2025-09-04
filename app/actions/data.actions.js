'use server';

import dbConnect from "@/config/connectDB";
import Form from "@/models/formclient";
import checkAuthToken from '@/utils/checktoken';
import { reloadForm } from '@/data/form_database/wraperdata.db.js'
import Customer from '@/models/customer.model';
import initAgenda from '@/config/agenda';
import mongoose from 'mongoose';
import { WorkflowTemplate, CustomerWorkflow } from '@/models/workflow.model';
import { revalidateData } from '@/app/actions/customer.actions';
import { sendGP } from "@/function/drive/appscript";
import { service_data } from '@/data/services/wraperdata.db'
import { se } from "date-fns/locale";

export async function createAreaAction(_previousState, formData) {
    await dbConnect();
    const name = formData.get('name');
    const user = await checkAuthToken();

    if (!user || !user.id) return { message: 'Bạn cần đăng nhập để thực hiện hành động này.', status: false };
    if (!user.role.includes('Admin')) {
        return { message: 'Bạn không có quyền thực hiện chức năng này', status: false };
    }
    const formInputValues = formData.getAll('formInput');
    const formInput = formInputValues.map(Number);
    const describe = formData.get('describe');
    if (!name) return { message: 'Tên form là bắt buộc.', status: false };
    if (name.length > 50) return { message: 'Tên form phải ít hơn 50 kí tự', status: false };
    if (describe.length > 1000) return { message: 'Mô tả phải ít hơn 1000 kí tự', status: false };
    const processedName = name.toString().toLowerCase().trim();
    try {
        const existingArea = await Form.findOne({ name: processedName });
        if (existingArea) {
            return { message: 'Lỗi: Tên form này đã tồn tại.', status: false };
        }
        const newArea = new Form({
            name: processedName,
            describe: describe?.toString().trim(),
            createdBy: user.id,
            formInput: formInput,
        });
        await newArea.save();
        reloadForm();
        return { message: `Đã tạo thành công form "${name}".`, status: true };
    } catch (error) {
        console.error("Lỗi tạo form:", error);
        return { message: 'Lỗi hệ thống, không thể tạo form.', status: false };
    }
}

export async function updateAreaAction(_previousState, formData) {
    const id = formData.get('id');
    const name = formData.get('name');
    const describe = formData.get('describe');
    const formInputValues = formData.getAll('formInput');
    const formInput = formInputValues.map(Number);
    const user = await checkAuthToken();
    if (!user || !user.id) return { message: 'Bạn cần đăng nhập để thực hiện hành động này.', status: false };
    if (!user.role.includes('Admin')) {
        return { message: 'Bạn không có quyền thực hiện chức năng này', status: false };
    }
    if (!id || !name) {
        return { message: 'Dữ liệu không hợp lệ (thiếu ID hoặc tên).', status: false };
    }
    if (name.length > 50) {
        return { message: 'Tên form phải ít hơn 50 kí tự', status: false };
    }
    const processedName = name.toString().toLowerCase().trim();
    try {
        await dbConnect();
        const existingArea = await Form.findOne({
            name: processedName,
            _id: { $ne: id }
        });

        if (existingArea) {
            return { message: 'Lỗi: Tên form này đã được sử dụng ở một khu vực khác.', status: false };
        }

        const updatedArea = await Form.findByIdAndUpdate(
            id,
            {
                name: processedName,
                describe: describe?.toString().trim(),
                formInput: formInput,
            },
            { new: true }
        );

        if (!updatedArea) {
            return { message: 'Không tìm thấy khu vực để cập nhật.', status: false };
        }
        reloadForm();
        return { message: `Đã cập nhật thành công form "${name}".`, status: true };

    } catch (error) {
        console.error("Lỗi cập nhật form:", error);
        return { message: 'Lỗi hệ thống, không thể cập nhật form.', status: false };
    }
}

export async function deleteAreaAction(_previousState, formData) {
    const id = formData.get('id');
    const user = await checkAuthToken();
    if (!user || !user.id) return { message: 'Bạn cần đăng nhập để thực hiện hành động này.', status: false };
    if (!user.role.includes('Admin') && !user.role.includes('Sale')) {
        return { message: 'Bạn không có quyền thực hiện chức năng này', status: false };
    }
    try {
        await dbConnect();
        const areaToDelete = await Form.findById(id);
        if (!areaToDelete) { return { status: false, message: 'Không tìm thấy khu vực để xóa.' }; }
        await Form.findByIdAndDelete(id);
        reloadForm();
        return { status: true, message: 'Xóa khu vực thành công!' };
    } catch (error) {
        console.error('Lỗi khi xóa khu vực:', error);
        return { status: false, message: 'Đã xảy ra lỗi. Không thể xóa khu vực.' };
    }
}

/**
 * Action đa năng TỐI ƯU HÓA UX: Xử lý đăng ký và thêm mới khách hàng.
 * - Phản hồi ngay lập tức sau khi lưu dữ liệu chính.
 * - Tự động chạy các tác vụ nặng (gắn workflow, gửi thông báo) trong nền.
 * - Trả về kết quả rõ ràng ('created' hoặc 'merged') để client hiển thị thông báo chính xác.
 * - Tương thích hoàn toàn với hook useActionUI.
 */
export async function addRegistrationToAction(_previousState, inputData) {
    console.log('[Action] Bắt đầu xử lý đăng ký/thêm mới khách hàng.');

    try {
        const isFormData = inputData instanceof FormData;
        const isManualEntry = !isFormData;

        // --- BƯỚC 0: CHUẨN HÓA DỮ LIỆU ĐẦU VÀO ---
        const rawData = {
            name: isFormData ? inputData.get('name')?.trim() : inputData.fullName?.trim(),
            address: isFormData ? inputData.get('address')?.trim() : inputData.address?.trim(),
            phone: isFormData ? inputData.get('phone')?.trim() : inputData.phone?.trim(),
            email: isFormData ? inputData.get('email')?.trim() : inputData.email?.trim(),
            bd: isFormData ? inputData.get('bd') : inputData.dob,
            service: isFormData ? inputData.get('service')?.trim() : inputData.service?.trim(),
            source: isFormData ? inputData.get('source')?.trim() : '68b5ebb3658a1123798c0ce4', // Source mặc định
            sourceName: isFormData ? inputData.get('sourceName')?.trim() : 'Trực tiếp', // SourceName mặc định
        };

        let user = null;
        if (isManualEntry) {
            user = await checkAuthToken();
            if (!user || !user.id) {
                return { ok: false, message: 'Bạn cần đăng nhập để thêm khách hàng.' };
            }
        }

        // --- BƯỚC 1: VALIDATE DỮ LIỆU ---
        if (!rawData.name) return { ok: false, message: 'Vui lòng nhập họ và tên.' };
        if (!rawData.phone) return { ok: false, message: 'Vui lòng nhập số điện thoại.' };

        const normalizedPhone = normalizePhone(rawData.phone);
        if (!/^0\d{9}$/.test(normalizedPhone)) {
            return { ok: false, message: 'Số điện thoại không hợp lệ (10 chữ số, bắt đầu bằng 0).' };
        }

        let birthDate = rawData.bd ? new Date(rawData.bd) : null;
        if (birthDate && isNaN(birthDate.getTime())) {
            return { ok: false, message: 'Ngày sinh không hợp lệ.' };
        }

        if (rawData.source && !mongoose.Types.ObjectId.isValid(rawData.source)) {
            return { ok: false, message: 'Nguồn dữ liệu không hợp lệ.' };
        }

        // --- BƯỚC 2: XỬ LÝ LOGIC CHÍNH ---
        await dbConnect();
        const existingCustomer = await Customer.findOne({ phone: normalizedPhone });

        // TRƯỜNG HỢP 1: KHÁCH HÀNG ĐÃ TỒN TẠI -> CẬP NHẬT
        if (existingCustomer) {
            console.log('[Action] Khách hàng đã tồn tại, gộp và cập nhật hồ sơ.');

            if (rawData.name && existingCustomer.name !== rawData.name) existingCustomer.name = rawData.name;
            if (rawData.address && existingCustomer.area !== rawData.address) existingCustomer.area = rawData.address;
            if (rawData.email && existingCustomer.email !== rawData.email) existingCustomer.email = rawData.email;
            if (birthDate && (!existingCustomer.bd || existingCustomer.bd.getTime() !== birthDate.getTime())) existingCustomer.bd = birthDate;

            existingCustomer.tags = [...new Set([...existingCustomer.tags, rawData.service].filter(Boolean))];
            existingCustomer.care.push({
                content: `Data trùng từ ${isManualEntry ? 'nhập liệu thủ công' : `form "${rawData.sourceName}"`}. Gộp và cập nhật hồ sơ.`,
                createBy: user?.id || '68b0af5cf58b8340827174e0',
                step: 1
            });

            await existingCustomer.save();
            revalidateData();

            // Chạy ngầm tác vụ gửi thông báo
            sendUpdateNotification(existingCustomer, rawData, 'updated', isManualEntry).catch(err => console.error('[Action] Lỗi ngầm khi gửi thông báo cập nhật:', err));

            return { ok: true, message: 'Số điện thoại đã tồn tại. Hồ sơ đã được cập nhật với thông tin mới.', type: 'merged' };
        }

        // TRƯỜNG HỢP 2: TẠO KHÁCH HÀNG MỚI
        console.log('[Action] Tạo khách hàng mới.');

        const isMissingInfo = !rawData.service || !rawData.email || !rawData.address;
        const pipelineStatus = isMissingInfo ? 'missing_info' : 'new_unconfirmed';

        const newCustomerData = {
            name: rawData.name,
            phone: normalizedPhone,
            email: rawData.email || '',
            area: rawData.address || '',
            tags: rawData.service ? [rawData.service] : [],
            bd: birthDate,
            pipelineStatus: pipelineStatus,
            care: [{ content: 'Khách hàng được nhận hồ sơ vào hệ thống', createBy: user?.id || '68b0af5cf58b8340827174e0', step: 1 }],
            source: rawData.source,
            sourceDetails: rawData.sourceName,
            ...(user && { createdBy: user.id }),
        };

        const newCustomer = new Customer(newCustomerData);
        await newCustomer.save();
        revalidateData();
        console.log(`[Action] Đã lưu khách hàng mới với trạng thái: ${pipelineStatus}. Bắt đầu các tác vụ nền.`);

        // Chạy ngầm các tác vụ phụ
        runWorkflowTasks(newCustomer).catch(err => console.error('[Action] Lỗi trong tác vụ nền (workflow):', err));
        sendUpdateNotification(newCustomer, rawData, 'created', isManualEntry).catch(err => console.error('[Action] Lỗi ngầm khi gửi thông báo tạo mới:', err));

        return { ok: true, message: 'Thêm khách hàng mới thành công!', type: 'created' };

    } catch (error) {
        console.error('[Action] Lỗi nghiêm trọng khi xử lý:', error);
        return { ok: false, message: 'Lỗi hệ thống, không thể xử lý yêu cầu.' };
    }
}


// --- CÁC HÀM HELPER ---

/**
 * Hàm helper để xử lý các tác vụ nền liên quan đến workflow.
 */
async function runWorkflowTasks(newCustomer) {
    console.log(`[Background] Bắt đầu tác vụ WORKFLOW cho khách hàng ID: ${newCustomer._id}`);
    const customerId = newCustomer._id;

    try {
        const templateId = '68b25ddbacc8f270aeb1ac8e'; // ID template mặc định
        const template = await WorkflowTemplate.findById(templateId);

        if (template) {
            const startTime = new Date();
            const customerWorkflow = new CustomerWorkflow({
                customerId,
                templateId,
                startTime,
                steps: template.steps.map(step => ({
                    action: step.action,
                    scheduledTime: new Date(startTime.getTime() + step.delay),
                    status: 'pending',
                    params: step.params,
                    retryCount: 0,
                })),
                nextStepTime: new Date(startTime.getTime() + (template.steps[0]?.delay || 0)),
                status: 'active',
            });
            await customerWorkflow.save();

            const agenda = await initAgenda();
            for (const step of customerWorkflow.steps) {
                await agenda.schedule(step.scheduledTime, step.action, {
                    customerId: customerId.toString(),
                    cwId: customerWorkflow._id.toString(),
                    params: step.params,
                });
            }

            newCustomer.workflowTemplates.push(template._id);
            await newCustomer.save();
            console.log(`[Background] Đã gắn và đặt lịch workflow cho khách hàng ${customerId}`);
        }
    } catch (err) {
        console.error(`[Background] Lỗi khi gắn workflow cho KH ${customerId}:`, err);
    }
}

/**
 * Hàm helper để gửi thông báo qua Google Apps Script.
 */
async function sendUpdateNotification(customer, rawData, type, isManualEntry) {
    let service = await service_data()
    service = service.find(item => item._id === rawData.service);
    try {
        const createAt = new Date();
        const formattedCreateAt = createAt.toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });

        const title = type === 'created'
            ? `📅 Đăng ký mới từ ${isManualEntry ? 'nhập liệu thủ công' : `Form "${rawData.sourceName}"`}`
            : `🔄 Cập nhật hồ sơ từ ${isManualEntry ? 'nhập liệu thủ công' : `Form "${rawData.sourceName}"`}`;

        const message = `${title}
-----------------------------------
Họ và tên: ${customer.name}
Liên hệ: ${customer.phone}
Dịch vụ quan tâm: ${service?.name || 'Không có'}
Thời gian: ${formattedCreateAt}`;
        await sendGP(message);
        console.log(`[Background] Đã gửi thông báo Apps Script cho KH ${customer._id} (Loại: ${type})`);
    } catch (err) {
        console.error(`[Background] Lỗi gửi Apps Script cho KH ${customer._id}:`, err);
    }
}

/**
 * Hàm helper để chuẩn hóa số điện thoại.
 */
function normalizePhone(phone) {
    const t = (phone ?? '').trim().replace(/\D/g, ''); // Chỉ giữ số
    if (!t) return '';
    if (t.length === 9 && ['3', '5', '7', '8', '9'].includes(t[0])) return '0' + t;
    if (t.startsWith('84')) return '0' + t.substring(2);
    return t.startsWith('0') ? t : '0' + t;
}