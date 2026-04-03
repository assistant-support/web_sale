'use server';

import dbConnect from "@/config/connectDB";
import Form from "@/models/formclient";
import checkAuthToken from '@/utils/checktoken';
import { reloadForm } from '@/data/form_database/wraperdata.db.js'
import Customer from '@/models/customer.model';
import initAgenda from '@/config/agenda';
import mongoose from 'mongoose';
import { revalidateData } from '@/app/actions/customer.actions';
import { sendGP } from "@/function/drive/appscript";
import { sendUserMessage, changeFriendAlias } from '@/data/zalo/chat.actions';
import { service_data } from '@/data/services/wraperdata.db'
import { se } from "date-fns/locale";
import autoAssignForCustomer from '@/utils/autoAssign';
import User from '@/models/users';
import ZaloAccount from '@/models/zalo.model';
import { ZaloAccount as ZaloAccountNew } from '@/models/zalo-account.model';
import Setting from '@/models/setting.model';
import Logs from '@/models/log.model';
import Variant from '@/models/variant.model';
import { findUserUid } from '@/data/zalo/chat.actions';
import { validatePipelineStatusUpdate } from '@/utils/pipelineStatus';
import { generateCustomerCodeByType, isDuplicateKeyError, parseCustomerCode } from '@/utils/customerCode';

export async function createAreaAction(_previousState, formData) {
    await dbConnect();
    const name = formData.get('name');
    const user = await checkAuthToken();

    if (!user || !user.id) return { message: 'Bạn cần đăng nhập để thực hiện hành động này.', status: false };
    console.log(user.role);

    if (!user.role.includes('Admin') && !user.role.includes('Manager')) {
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
    if (!user.role.includes('Admin') && !user.role.includes('Manager')) {
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
    if (!user.role.includes('Admin') && !user.role.includes('Manager')) {
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
 * Action đa năng: Xử lý đăng ký và thêm mới khách hàng.
 */
export async function addRegistrationToAction(_previousState, inputData) {
    try {
        const isFormData = inputData instanceof FormData;
        const isManualEntry = !isFormData;

        // Chuẩn hóa dữ liệu đầu vào
        const rawData = {
            name: isFormData ? inputData.get('name')?.trim() : inputData.fullName?.trim(),
            address: isFormData ? inputData.get('address')?.trim() : inputData.address?.trim(),
            phone: isFormData ? inputData.get('phone')?.trim() : inputData.phone?.trim(),
            email: isFormData ? inputData.get('email')?.trim() : inputData.email?.trim(),
            bd: isFormData ? inputData.get('bd') : inputData.dob,
            service: isFormData ? inputData.get('service')?.trim() : inputData.service?.trim(),
            source: isFormData ? inputData.get('source')?.trim() : '68b5ebb3658a1123798c0ce4',
            sourceName: isFormData ? inputData.get('sourceName')?.trim() : 'Trực tiếp',
            customerCode: isFormData ? inputData.get('customerCode')?.trim() : inputData.customerCode?.trim(),
        };

        let user = null;
        if (isManualEntry) {
            user = await checkAuthToken();
            if (!user || !user.id) {
                return { ok: false, message: 'Bạn cần đăng nhập để thêm khách hàng.' };
            }
        }

        // Validate dữ liệu
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

        // Xử lý logic chính
        await dbConnect();
        const existingCustomer = await Customer.findOne({ phone: normalizedPhone });

        // TRƯỜNG HỢP 1: KHÁCH HÀNG ĐÃ TỒN TẠI -> CẬP NHẬT
        if (existingCustomer) {
            const oldBd = existingCustomer.bd;
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
            // Kiểm tra xem có nên cập nhật không (chỉ cập nhật nếu step mới > step hiện tại)
            const validatedStatus = validatePipelineStatusUpdate(existingCustomer, 'duplicate_merged_1');
            if (validatedStatus) {
                existingCustomer.pipelineStatus[0] = validatedStatus;
                existingCustomer.pipelineStatus[1] = validatedStatus;
            }
            await existingCustomer.save();
            
            // Cập nhật Fillter_customer nếu bd thay đổi
            if (birthDate && (!oldBd || oldBd.getTime() !== birthDate.getTime())) {
                const { updateFilterCustomer } = await import('@/utils/updateFilterCustomer');
                updateFilterCustomer(existingCustomer._id, birthDate, oldBd).catch(err => {
                    console.error('[addRegistrationToAction] Lỗi khi cập nhật Fillter_customer:', err);
                });
            }
            
            try {
                if (!Array.isArray(existingCustomer.assignees) || existingCustomer.assignees.length === 0) {
                    const svcId = rawData.service || (existingCustomer.tags?.[0] || null);
                    await autoAssignForCustomer(existingCustomer._id, { serviceId: svcId });
                }
            } catch (e) {
                console.error('[Action] Duplicate merge - auto-assign error:', e?.message || e);
            }
            
            revalidateData();
            sendUpdateNotification(existingCustomer, rawData, 'updated', isManualEntry).catch(err => {
                console.error('[addRegistrationToAction] Lỗi ngầm khi gửi thông báo cập nhật:', err);
            });
            return { ok: true, message: 'Số điện thoại đã tồn tại. Hồ sơ đã được cập nhật với thông tin mới.', type: 'merged' };
        }

        // TRƯỜNG HỢP 2: TẠO KHÁCH HÀNG MỚI
        const customerCodeType = rawData.sourceName === 'Trực tiếp' ? 'NORMAL' : 'TN';

        // Nếu client đã gửi mã gợi ý (hệ thống tự sinh), ưu tiên dùng mã đó ở attempt đầu tiên.
        let preferredCodePayload = null;
        if (rawData.customerCode) {
            const parsed = parseCustomerCode(rawData.customerCode);
            if (parsed?.customerCodeType === customerCodeType) {
                preferredCodePayload = {
                    customerCode: parsed.canonicalCustomerCode,
                    customerCodeType: parsed.customerCodeType,
                    customerCodeNumber: parsed.customerCodeNumber,
                };
            }
        }

        const newCustomerData = {
            name: rawData.name,
            phone: normalizedPhone,
            email: rawData.email || '',
            area: rawData.address || '',
            tags: rawData.service ? [rawData.service] : [],
            bd: birthDate,
            pipelineStatus: ['new_unconfirmed_1', 'new_unconfirmed_1'],
            care: [{ content: 'Khách hàng được nhận hồ sơ vào hệ thống', createBy: user?.id || '68b0af5cf58b8340827174e0', step: 1 }],
            source: rawData.source,
            sourceDetails: rawData.sourceName,
            ...(user && { createdBy: user.id }),
        };

        // Sinh mã khách hàng khi tạo mới.
        // - KH khách cũ (không có customerCode) sẽ giữ nguyên field trống cho tới khi nhân viên bấm sửa.
        // - Dùng retry vì có thể race condition khi nhiều request tạo cùng lúc.
        let newCustomer = null;
        for (let attempt = 0; attempt < 5; attempt++) {
            const codePayload =
                attempt === 0 && preferredCodePayload
                    ? preferredCodePayload
                    : await generateCustomerCodeByType(customerCodeType);
            const payload = {
                ...newCustomerData,
                customerCode: codePayload.customerCode,
                customerCodeType: codePayload.customerCodeType,
                customerCodeNumber: codePayload.customerCodeNumber,
            };

            try {
                newCustomer = new Customer(payload);
                await newCustomer.save();
                break;
            } catch (err) {
                if (isDuplicateKeyError(err) && attempt < 4) continue;
                throw err;
            }
        }
        if (!newCustomer) {
            return { ok: false, message: 'Lỗi hệ thống, không thể tạo mã khách hàng.' };
        }
        
        // Cập nhật Fillter_customer nếu có bd
        if (birthDate) {
            const { updateFilterCustomer } = await import('@/utils/updateFilterCustomer');
            updateFilterCustomer(newCustomer._id, birthDate, null).catch(err => {
                console.error('[addRegistrationToAction] Lỗi khi cập nhật Fillter_customer:', err);
            });
        }
        
        try {
            await autoAssignForCustomer(newCustomer._id, { serviceId: rawData.service || null });
        } catch (e) {
            console.error('[Action] Auto-assign theo dịch vụ lỗi:', e?.message || e);
        }
        
        revalidateData();
        
        // Chạy ngầm các tác vụ phụ:
        // 1. Gửi thông báo Zalo cho team (thông báo có khách hàng mới)
        sendUpdateNotification(newCustomer, rawData, 'created', isManualEntry).catch(err => {
            console.error('[addRegistrationToAction] Lỗi ngầm khi gửi thông báo tạo mới:', err);
        });
        
        // 2. Tìm UID và gửi tin nhắn xác nhận đến khách hàng
        processFindUidAndSendMessage(newCustomer).catch(err => {
            console.error('[addRegistrationToAction] Lỗi trong tác vụ nền (findUid & sendMessage):', err);
        });
        
        return { ok: true, message: 'Thêm khách hàng mới thành công!', type: 'created' };

    } catch (error) {
        console.error('[Action] Lỗi nghiêm trọng khi xử lý:', error);
        return { ok: false, message: 'Lỗi hệ thống, không thể xử lý yêu cầu.' };
    }
}

// Map để track các customer đã gửi thông báo (tránh gửi trùng)
const notificationSentMap = new Map(); // key: customerId, value: timestamp

/**
 * Hàm helper để gửi thông báo qua Google Apps Script.
 */
async function sendUpdateNotification(customer, rawData, type, isManualEntry) {
    try {
        const customerId = customer._id.toString();
        const now = Date.now();
        const DEBOUNCE_TIME = 30000; // 30 giây - tránh gửi trùng trong 30s
        
        // Kiểm tra xem đã gửi thông báo cho customer này trong 30s gần đây chưa
        const lastSentTime = notificationSentMap.get(customerId);
        if (lastSentTime && (now - lastSentTime) < DEBOUNCE_TIME) {
            console.log(`[sendUpdateNotification] ⚠️ Bỏ qua vì đã gửi thông báo cho KH ${customerId} trong ${Math.round((now - lastSentTime) / 1000)}s gần đây`);
            return;
        }
        
        // Đánh dấu đã gửi thông báo
        notificationSentMap.set(customerId, now);
        
        // Cleanup map sau 1 phút để tránh memory leak
        setTimeout(() => {
            notificationSentMap.delete(customerId);
        }, 60000);
        
        // 1. Lấy thông tin dịch vụ
        let service = await service_data();
        service = service.find(item => item._id === rawData.service);

        // 2. Format thời gian
        const createAt = new Date();
        const formattedCreateAt = createAt.toLocaleString('vi-VN', { 
            timeZone: 'Asia/Ho_Chi_Minh' 
        });

        // 3. Tạo title (tiêu đề)
        const title = type === 'created'
            ? `📅 Đăng ký mới từ ${isManualEntry ? 'nhập liệu thủ công' : `Form "${rawData.sourceName}"`}`
            : `🔄 Cập nhật hồ sơ từ ${isManualEntry ? 'nhập liệu thủ công' : `Form "${rawData.sourceName}"`}`;

        // 4. Format tin nhắn hoàn chỉnh
        const message = `${title}
-----------------------------------
Họ và tên: ${customer.name}
Liên hệ: ${customer.phone}
Dịch vụ quan tâm: ${service?.name || 'Không có'}
Thời gian: ${formattedCreateAt}`;

        // 5. Gửi qua Google Apps Script
        await sendGP(message);
        
    } catch (err) {
        const customerId = customer._id?.toString() || 'unknown';
        console.error(`[sendUpdateNotification] ❌ Lỗi gửi Apps Script cho KH ${customerId}:`, err);
        // Xóa khỏi map nếu có lỗi để có thể retry
        notificationSentMap.delete(customerId);
        throw err; // Re-throw để caller có thể handle
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

/**
 * Hàm helper để chuẩn hóa UID Zalo.
 */
function normalizeUid(u) {
    const s = String(u ?? '').trim();
    const digits = s.replace(/\D/g, '');
    return digits;
}

/**
 * Hàm helper để format message với các placeholder.
 */
async function formatMessage(template, targetDoc, zaloAccountDoc) {
    if (!template) return "";
    let message = template;

    message = message.replace(/{name}/g, targetDoc.name || "");
    message = message.replace(/{nameparent}/g, targetDoc.nameparent || "");
    message = message.replace(/{namezalo}/g, targetDoc.zaloname || "");

    const variantPlaceholders = message.match(/{[^{}]+}/g) || [];
    for (const placeholder of variantPlaceholders) {
        const variantName = placeholder.slice(1, -1);
        const variant = await Variant.findOne({ name: variantName }).lean();
        if (variant && variant.phrases && variant.phrases.length > 0) {
            const randomPhrase = variant.phrases[Math.floor(Math.random() * variant.phrases.length)];
            message = message.replace(placeholder, randomPhrase);
        }
    }

    return message;
}

/**
 * Hàm helper để tìm tài khoản Zalo khả dụng.
 */
async function findNextAvailableZaloAccount() {
    try {
        // Đảm bảo kết nối MongoDB
        await dbConnect();
        
        // Debug: Kiểm tra collection name
        const collectionName = ZaloAccountNew.collection.name;
        console.log('[findNextAvailableZaloAccount] 🔍 Collection name:', collectionName);
        
        // Debug: Đếm tổng số tài khoản
        const totalCount = await ZaloAccountNew.countDocuments({});
        console.log('[findNextAvailableZaloAccount] 📊 Tổng số tài khoản trong DB:', totalCount);
        
        // Debug: Đếm số tài khoản active
        const activeCount = await ZaloAccountNew.countDocuments({ status: 'active' });
        console.log('[findNextAvailableZaloAccount] 📊 Số tài khoản active:', activeCount);
        
        // Debug: Lấy tất cả tài khoản để xem
        const allAccounts = await ZaloAccountNew.find({}).select('accountKey status updatedAt').lean();
        console.log('[findNextAvailableZaloAccount] 📋 Tất cả tài khoản:', allAccounts.map(acc => ({
            accountKey: acc.accountKey,
            status: acc.status,
            updatedAt: acc.updatedAt
        })));
        
        // Lấy tài khoản đầu tiên từ ZaloAccount mới (Zalo Hệ Thống) có status active
        // Sắp xếp theo updatedAt tăng dần (cũ nhất trước) để ưu tiên tài khoản ít được sử dụng nhất
        const zaloAccount = await ZaloAccountNew.findOne({ 
            status: 'active' 
        }).sort({ updatedAt: 1 }).lean(); // 1 = ascending (cũ nhất trước)
        
        if (zaloAccount) {
            console.log('[findNextAvailableZaloAccount] ✅ Tìm thấy tài khoản Zalo từ hệ thống mới:', zaloAccount.accountKey, 'updatedAt:', zaloAccount.updatedAt);
            // Trả về object tương thích với code cũ
            return {
                _id: zaloAccount._id,
                uid: zaloAccount.accountKey, // accountKey là uid trong hệ thống mới
                accountKey: zaloAccount.accountKey,
                name: zaloAccount.profile?.displayName || 'Zalo Account',
                rateLimitPerHour: 999, // Không giới hạn trong hệ thống mới
                rateLimitPerDay: 9999
            };
        }
        
        console.warn('[findNextAvailableZaloAccount] ⚠️ Không có tài khoản Zalo nào có status active trong hệ thống mới.');
        return null;
    } catch (err) {
        console.error('[findNextAvailableZaloAccount] ❌ Lỗi khi tìm tài khoản Zalo:', err);
        console.error('[findNextAvailableZaloAccount] ❌ Error stack:', err?.stack);
        return null;
    }
}

/**
 * Hàm xử lý nền: Tìm UID Zalo và gửi tin nhắn xác nhận.
 */
async function processFindUidAndSendMessage(newCustomer) {
   
    const customerId = newCustomer._id;
    const phone = newCustomer.phone;
    let findUidStatus = "thất bại";
    let renameStatus = "không thực hiện";
    let messageStatus = "không thực hiện";
    
    try {
        await dbConnect();
        
        // 1. Tìm tài khoản Zalo khả dụng từ ZaloAccount mới (Zalo Hệ Thống)
        let selectedZalo = await findNextAvailableZaloAccount();
        if (!selectedZalo || !selectedZalo.accountKey) {
            console.error('[processFindUidAndSendMessage] ❌ Không tìm thấy tài khoản Zalo khả dụng. Vui lòng đăng nhập QR trước.');
            return;
        }
        
        // Lấy accountKey trực tiếp từ selectedZalo (đã được lấy từ ZaloAccount mới)
        let accountKey = selectedZalo.accountKey;
        console.log('[processFindUidAndSendMessage] 🔑 Sử dụng accountKey từ Zalo Hệ Thống:', accountKey);
        
        // 2. Format phone number (chuẩn hóa cho zca-js - bỏ ký tự đặc biệt, chỉ giữ số)
        let formattedPhone = phone.toString().trim().replace(/\D/g, '');
        console.log('[processFindUidAndSendMessage] 📞 Số điện thoại đã chuẩn hóa:', formattedPhone);
        
        // 4. Tìm UID Zalo bằng zca-js
        console.log('[processFindUidAndSendMessage] 🔍 Đang tìm UID với accountKey:', accountKey, 'phone:', formattedPhone);
        
        let findUidResult;
        try {
            findUidResult = await findUserUid({
                accountKey: accountKey,
                phoneOrUid: formattedPhone
            });
            
            console.log('[processFindUidAndSendMessage] 📥 Kết quả findUserUid:', {
                ok: findUidResult?.ok,
                uid: findUidResult?.uid,
                message: findUidResult?.message,
                code: findUidResult?.code
            });
        } catch (err) {
            console.error('[processFindUidAndSendMessage] ❌ Lỗi khi gọi findUserUid:', err);
            findUidResult = {
                ok: false,
                message: err?.message || 'Lỗi không xác định khi tìm UID',
                code: 'error'
            };
        }
        
        // Format response để tương thích với code cũ
        let findUidResponse = {
            status: findUidResult?.ok || false,
            message: findUidResult?.message || '',
            content: {
                error_code: findUidResult?.ok ? 0 : (findUidResult?.code === 'not_found' ? 216 : -1),
                error_message: findUidResult?.message || '',
                data: findUidResult?.ok ? {
                    uid: findUidResult.uid || '',
                    avatar: findUidResult.avatar || '',
                    zalo_name: findUidResult.displayName || '',
                    display_name: findUidResult.displayName || ''
                } : {}
            }
        };
        
        if (findUidResponse.status) {
            console.log('[processFindUidAndSendMessage] ✅ Tìm UID thành công:', findUidResult.uid);
        } else {
            console.error('[processFindUidAndSendMessage] ❌ Tìm UID thất bại:', findUidResult?.message);
        }
        
        // Lưu ID của log đầu tiên để có thể xóa nếu retry thành công
        let firstLogId = null;
        
        // Log kết quả findUid
        const firstLog = await Logs.create({
            status: {
                status: findUidResponse.status,
                message: findUidResponse.content?.error_message || findUidResponse.message || '',
                data: {
                    error_code: findUidResponse.content?.error_code,
                    error_message: findUidResponse.content?.error_message,
                },
            },
            type: "findUid",
            createBy: newCustomer.createdBy || '68b0af5cf58b8340827174e0',
            customer: customerId,
            zalo: selectedZalo._id,
        });
        firstLogId = firstLog._id;
        
        // Xử lý retry nếu tài khoản Zalo ngừng hoạt động hoặc lỗi
        if (!findUidResponse.status && (findUidResponse.message?.includes('ngừng hoạt động') || findUidResult?.code === 'unauthorized' || findUidResult?.code === 'bootstrap_failed')) {
            // Lấy tất cả tài khoản ZaloAccount mới (trừ account hiện tại)
            // Sắp xếp theo updatedAt tăng dần (cũ nhất trước) để ưu tiên tài khoản ít được sử dụng nhất
            const allAccounts = await ZaloAccountNew.find({ 
                status: 'active',
                accountKey: { $ne: accountKey }
            }).sort({ updatedAt: 1 }).lean(); // 1 = ascending (cũ nhất trước)
            
            console.log('[processFindUidAndSendMessage] 🔄 Bắt đầu retry với', allAccounts.length, 'tài khoản khác');
            
            for (const retryZaloAccount of allAccounts) {
                if (!retryZaloAccount?.accountKey) {
                    continue;
                }
                
                const retryAccountKey = retryZaloAccount.accountKey;
                console.log('[processFindUidAndSendMessage] 🔄 Retry với accountKey:', retryAccountKey);
                    
                // Retry với zca-js
                let retryFindUidResult;
                try {
                    retryFindUidResult = await findUserUid({
                        accountKey: retryAccountKey,
                        phoneOrUid: formattedPhone
                    });
                } catch (err) {
                    console.error('[processFindUidAndSendMessage] ❌ Lỗi khi retry findUserUid:', err);
                    retryFindUidResult = {
                        ok: false,
                        message: err?.message || 'Lỗi không xác định',
                        code: 'error'
                    };
                }
                
                // Format response
                findUidResponse = {
                    status: retryFindUidResult?.ok || false,
                    message: retryFindUidResult?.message || '',
                    content: {
                        error_code: retryFindUidResult?.ok ? 0 : (retryFindUidResult?.code === 'not_found' ? 216 : -1),
                        error_message: retryFindUidResult?.message || '',
                        data: retryFindUidResult?.ok ? {
                            uid: retryFindUidResult.uid || '',
                            avatar: retryFindUidResult.avatar || '',
                            zalo_name: retryFindUidResult.displayName || '',
                            display_name: retryFindUidResult.displayName || ''
                        } : {}
                    }
                };
                
                if (findUidResponse.status) {
                    // Retry thành công - XÓA LOG ĐẦU TIÊN (thất bại) và chỉ giữ log thành công
                    if (firstLogId) {
                        await Logs.deleteOne({ _id: firstLogId });
                        console.log('[processFindUidAndSendMessage] 🗑️ Đã xóa log thất bại đầu tiên (ID: ' + firstLogId + ') vì retry thành công');
                    }
                    
                    // Log retry thành công
                    await Logs.create({
                        status: {
                            status: true,
                            message: `✅ Tìm thành công UID Zalo (retry với tài khoản khác)`,
                            data: {
                                error_code: findUidResponse.content?.error_code || 0,
                                error_message: findUidResponse.content?.error_message || 'Thành công',
                            },
                        },
                        type: "findUid",
                        createBy: newCustomer.createdBy || '68b0af5cf58b8340827174e0',
                        customer: customerId,
                        zalo: selectedZalo._id, // Giữ nguyên selectedZalo._id từ lần đầu
                    });
                    
                    findUidStatus = "thành công (retry)";
                    accountKey = retryAccountKey; // Cập nhật accountKey cho phần sau
                    
                    console.log('[processFindUidAndSendMessage] ✅ Retry thành công với accountKey:', retryAccountKey);
                    break;
                } else {
                    // Retry thất bại - log lại nhưng không xóa log đầu tiên
                    await Logs.create({
                        status: {
                            status: false,
                            message: `Retry thất bại với tài khoản ${retryZaloAccount.profile?.displayName || retryAccountKey}: ${findUidResponse.content?.error_message || findUidResponse.message || ''}`,
                            data: {
                                error_code: findUidResponse.content?.error_code,
                                error_message: findUidResponse.content?.error_message,
                            },
                        },
                        type: "findUid",
                        createBy: newCustomer.createdBy || '68b0af5cf58b8340827174e0',
                        customer: customerId,
                        zalo: selectedZalo._id, // Giữ nguyên selectedZalo._id từ lần đầu
                    });
                    
                    console.log('[processFindUidAndSendMessage] ❌ Retry thất bại với accountKey:', retryAccountKey);
                }
            }
        }
        
        // 4. Lưu UID vào Customer nếu tìm thành công
        const raw = findUidResponse?.content ?? null;
        const rawUid = raw?.data?.uid ?? null;
        const normalizedUid = normalizeUid(rawUid);
        
        if (findUidResponse.status === true && normalizedUid) {
            if (findUidStatus !== "thành công (retry)") {
                findUidStatus = "thành công";
            }
            
            // Cập nhật rate limit
            await ZaloAccount.updateOne(
                { _id: selectedZalo._id },
                { $inc: { rateLimitPerHour: -1, rateLimitPerDay: -1 } }
            );
            
            // Lưu UID và thông tin Zalo vào Customer
            await Customer.updateOne(
                { _id: customerId },
                {
                    $set: {
                        zaloavt: raw?.data?.avatar || null,
                        zaloname: raw?.data?.zalo_name || null,
                    },
                    $push: {
                        uid: {
                            zalo: selectedZalo._id,
                            uid: normalizedUid
                        },
                        care: {
                            content: `✅ Tìm thành công UID Zalo: ${normalizedUid}`,
                            createBy: newCustomer.createdBy || '68b0af5cf58b8340827174e0',
                            step: 1,
                            createAt: new Date()
                        }
                    }
                }
            );
            
            
            // Revalidate để cập nhật UI ngay lập tức
            revalidateData();
            
            // 5. Tag (đổi tên gợi nhớ) - Optional - Sử dụng zca-js
            try {
                const form = await Form.findById(newCustomer.source).select('name').lean();
                const srcName = form ? form.name : String(newCustomer.source || 'Unknown');
                const newZaloName = `${newCustomer.name}_${srcName}`;
                
                // Lấy accountKey từ ZaloAccount mới để đổi tên gợi nhớ bằng zca-js
                let tagAccountKey = accountKey; // Sử dụng accountKey đã có từ phần tìm UID
                
                if (!tagAccountKey) {
                    // Nếu không có accountKey, tìm lại
                    try {
                        const zaloAccount = await ZaloAccountNew.findOne({
                            $or: [
                                { 'profile.zaloId': String(selectedZalo.uid).trim() },
                                { accountKey: String(selectedZalo.uid).trim() }
                            ],
                            status: 'active'
                        }).sort({ updatedAt: 1 }).lean();
                        
                        if (zaloAccount?.accountKey) {
                            tagAccountKey = zaloAccount.accountKey;
                        } else {
                            const fallbackAccount = await ZaloAccountNew.findOne({ 
                                status: 'active' 
                            }).sort({ updatedAt: 1 }).lean();
                            if (fallbackAccount?.accountKey) {
                                tagAccountKey = fallbackAccount.accountKey;
                            }
                        }
                    } catch (err) {
                        console.error('[processFindUidAndSendMessage] Lỗi khi tìm accountKey cho tag:', err);
                    }
                }
                
                let renameResponse;
                if (!tagAccountKey) {
                    renameResponse = {
                        status: false,
                        content: {
                            error_code: -1,
                            error_message: 'Không tìm thấy tài khoản Zalo hợp lệ. Vui lòng đăng nhập QR trước.',
                            data: {}
                        }
                    };
                } else {
                    try {
                        const result = await changeFriendAlias({
                            accountKey: tagAccountKey,
                            userId: normalizedUid,
                            alias: newZaloName
                        });
                        
                        // Format result để tương thích với code cũ
                        renameResponse = {
                            status: result.ok || false,
                            content: {
                                error_code: result.ok ? 0 : -1,
                                error_message: result.ok ? '' : (result.message || 'Đổi tên gợi nhớ thất bại'),
                                data: result.result || {}
                            }
                        };
                    } catch (err) {
                        console.error('[processFindUidAndSendMessage] Lỗi khi đổi tên gợi nhớ:', err);
                        renameResponse = {
                            status: false,
                            content: {
                                error_code: -1,
                                error_message: err?.message || 'Lỗi không xác định',
                                data: {}
                            }
                        };
                    }
                }
                
                await Logs.create({
                    message: newZaloName,
                    status: {
                        status: renameResponse.status,
                        message: renameResponse.content?.error_message || renameResponse.message || '',
                        data: {
                            error_code: renameResponse.content?.error_code,
                            error_message: renameResponse.content?.error_message,
                        },
                    },
                    type: "tag",
                    createBy: newCustomer.createdBy || '68b0af5cf58b8340827174e0',
                    customer: customerId,
                    zalo: selectedZalo._id,
                });
                
                if (renameResponse.status) {
                    renameStatus = "thành công";
                } else {
                    renameStatus = "thất bại";
                }
            } catch (renameError) {
                console.error('[processFindUidAndSendMessage] Lỗi trong lúc đổi tên gợi nhớ:', renameError.message);
                renameStatus = "thất bại";
            }
            
            // 6. Gửi tin nhắn xác nhận
            try {
                const messageSetting = await Setting.findOne({ _id: '68b0c30b3c4e62132237be77' }).lean();
                
                if (messageSetting && messageSetting.content) {
                    let template = messageSetting.content;
                    
                    // Xử lý placeholder {nameform}
                    if (template.includes("{nameform}")) {
                        const form = await Form.findById(newCustomer.source).select('name').lean();
                        template = template.replace(/{nameform}/g, form ? form.name : "");
                    }
                    
                    // Format message với các placeholder khác
                    const doc = await Customer.findById(customerId).lean();
                    const finalMessageToSend = await formatMessage(template, doc, selectedZalo);
                    
                    if (finalMessageToSend) {
                        console.log('[processFindUidAndSendMessage] Đang gửi tin nhắn xác nhận...');
                        
                        // Lấy accountKey từ ZaloAccount mới để gửi tin nhắn bằng zca-js
                        let sendAccountKey = accountKey; // Sử dụng accountKey đã có từ phần tìm UID
                        
                        if (!sendAccountKey) {
                            // Nếu không có accountKey, tìm lại
                            try {
                                const zaloAccount = await ZaloAccountNew.findOne({
                                    $or: [
                                        { 'profile.zaloId': String(selectedZalo.uid).trim() },
                                        { accountKey: String(selectedZalo.uid).trim() }
                                    ],
                                    status: 'active'
                                }).sort({ updatedAt: 1 }).lean();
                                
                                if (zaloAccount?.accountKey) {
                                    sendAccountKey = zaloAccount.accountKey;
                                } else {
                                    const fallbackAccount = await ZaloAccountNew.findOne({ 
                                        status: 'active' 
                                    }).sort({ updatedAt: 1 }).lean();
                                    if (fallbackAccount?.accountKey) {
                                        sendAccountKey = fallbackAccount.accountKey;
                                    }
                                }
                            } catch (err) {
                                console.error('[processFindUidAndSendMessage] Lỗi khi tìm accountKey:', err);
                            }
                        }
                        
                        let sendMessageResponse;
                        if (!sendAccountKey) {
                            sendMessageResponse = {
                                status: false,
                                content: {
                                    error_code: -1,
                                    error_message: 'Không tìm thấy tài khoản Zalo hợp lệ. Vui lòng đăng nhập QR trước.',
                                    data: {}
                                }
                            };
                        } else {
                            try {
                                const result = await sendUserMessage({
                                    accountKey: sendAccountKey,
                                    userId: normalizedUid,
                                    text: finalMessageToSend,
                                    attachments: []
                                });
                                
                                // Format result để tương thích với code cũ
                                sendMessageResponse = {
                                    status: result.ok || false,
                                    content: {
                                        error_code: result.ok ? 0 : -1,
                                        error_message: result.ok ? '' : (result.message || 'Gửi tin nhắn thất bại'),
                                        data: result.ack || {}
                                    }
                                };
                            } catch (err) {
                                console.error('[processFindUidAndSendMessage] Lỗi khi gửi tin nhắn:', err);
                                sendMessageResponse = {
                                    status: false,
                                    content: {
                                        error_code: -1,
                                        error_message: err?.message || 'Lỗi không xác định',
                                        data: {}
                                    }
                                };
                            }
                        }
                        
                        // Log kết quả gửi tin nhắn
                        await Logs.create({
                            status: {
                                status: sendMessageResponse.status,
                                message: finalMessageToSend || 'Không có tin nhắn gửi đi',
                                data: {
                                    error_code: sendMessageResponse.content?.error_code,
                                    error_message: sendMessageResponse.content?.error_message,
                                },
                            },
                            type: "sendMessage",
                            createBy: newCustomer.createdBy || '68b0af5cf58b8340827174e0',
                            customer: customerId,
                            zalo: selectedZalo._id,
                        });
                        
                        // Kiểm tra cả status và error_code để xác định thành công
                        const isSuccess = sendMessageResponse.status === true || sendMessageResponse.content?.error_code === 0;
                        
                        if (isSuccess) {
                            messageStatus = "thành công";
                           
                            // Cập nhật care log và pipelineStatus khi thành công
                            await Customer.findByIdAndUpdate(customerId, {
                                $push: {
                                    care: {
                                        content: `✅ [Gửi tin nhắn Zalo] đã hoàn thành thành công: ${finalMessageToSend.substring(0, 100)}${finalMessageToSend.length > 100 ? '...' : ''}`,
                                        createBy: newCustomer.createdBy || '68b0af5cf58b8340827174e0',
                                        step: 2,
                                        createAt: new Date()
                                    }
                                },
                                $set: {
                                    'pipelineStatus.0': 'msg_success_2',
                                    'pipelineStatus.2': 'msg_success_2'
                                }
                            });
                        } else {
                            messageStatus = "thất bại";
                            const errorMsg = sendMessageResponse.content?.error_message || sendMessageResponse.message || 'Không xác định data.actions.js';
                            console.error('[processFindUidAndSendMessage] ❌ Gửi tin nhắn thất bại:', {
                                status: sendMessageResponse.status,
                                error_code: sendMessageResponse.content?.error_code,
                                error_message: errorMsg
                            });
                            
                            // Cập nhật care log và pipelineStatus khi thất bại
                            await Customer.findByIdAndUpdate(customerId, {
                                $push: {
                                    care: {
                                        content: `❌ [Gửi tin nhắn Zalo] thất bại: ${errorMsg}`,
                                        createBy: newCustomer.createdBy || '68b0af5cf58b8340827174e0',
                                        step: 2,
                                        createAt: new Date()
                                    }
                                },
                                $set: {
                                    'pipelineStatus.0': 'msg_error_2',
                                    'pipelineStatus.2': 'msg_error_2'
                                }
                            });
                        }
                    } else {
                        messageStatus = "bỏ qua (template rỗng)";
                    }
                } else {
                    messageStatus = "bỏ qua (không có template)";
                    console.log('[processFindUidAndSendMessage] ⚠️ Không tìm thấy template tin nhắn xác nhận');
                }
            } catch (messageError) {
                console.error('[processFindUidAndSendMessage] Lỗi trong lúc gửi tin nhắn:', messageError.message);
                messageStatus = "thất bại";
            }
            
            // Revalidate để cập nhật UI
            revalidateData();
        } else {
            console.warn('[processFindUidAndSendMessage] ⚠️ Không tìm thấy UID hợp lệ cho KH:', customerId);
            findUidStatus = "thất bại";
            
            // Thêm care log khi tìm UID thất bại
            const errorMsg = findUidResponse?.content?.error_message || findUidResponse?.message || 'Không tìm thấy UID';
            await Customer.findByIdAndUpdate(customerId, {
                $push: {
                    care: {
                        content: `❌ Tìm UID thất bại: ${errorMsg}`,
                        createBy: newCustomer.createdBy || '68b0af5cf58b8340827174e0',
                        step: 1,
                        createAt: new Date()
                    }
                },
                $set: { uid: null } // Đánh dấu là tìm thất bại
            });
            
            // Revalidate để cập nhật UI
            revalidateData();
        }
        
    } catch (e) {
        console.error('[processFindUidAndSendMessage] ❌ Lỗi nghiêm trọng trong tiến trình nền cho KH', customerId, ':', e.message);
        console.error('[processFindUidAndSendMessage] Stack trace:', e.stack);
    } finally {
        // Gửi thông báo tóm tắt kết quả
        const finalMessage = `
Hành động xác nhận khách hàng mới: ${phone}
- Tìm uid người dùng: ${findUidStatus}
- Đổi tên gợi nhớ: ${renameStatus}
- Đã gửi tin nhắn: ${messageStatus}`.trim();
        
        try {
            await sendGP(finalMessage);
            console.log('[processFindUidAndSendMessage] ✅ Gửi thông báo thành công');
        } catch (gpError) {
            console.error('[processFindUidAndSendMessage] ❌ Gửi thông báo thất bại:', gpError.message);
        }
        
        console.log('[processFindUidAndSendMessage] ====================================');
    }
}