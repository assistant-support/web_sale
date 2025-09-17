'use server';

import { revalidateTag } from 'next/cache';
import mongoose from 'mongoose';
import Customer from '@/models/customer.model';
// THAY ĐỔI: Import hàm upload file chung từ file action trên Canvas
import { uploadFileToDrive } from '@/function/drive/image';
import checkAuthToken from '@/utils/checktoken';
import connectDB from '@/config/connectDB';
import { getCustomersAll } from '@/data/customers/handledata.db';
import { revalidateData } from '@/app/actions/customer.actions';

/* ============================================================
 * Helpers
 * ============================================================ */
const isValidObjectId = (id) => mongoose.Types.ObjectId.isValid(String(id));
const allowedServiceStatus = new Set(['new', 'in_progress', 'completed']);

function pipelineFromServiceStatus(st) {
    return st === 'completed' ? 'serviced_completed_6' : 'serviced_in_progress_6';
}


async function pushCareLog(customerId, content, userId, step = 6) {
    await Customer.updateOne(
        { _id: customerId },
        {
            $push: {
                care: { content, step, createBy: userId, createAt: new Date() },
            },
        }
    );
}

/* ============================================================
 * DATA BRIDGE (Giữ nguyên hành vi)
 * ============================================================ */
export async function customer_data(params = {}) {
    // Giữ nguyên hàm này
    return await getCustomersAll();
}

export async function reloadCustomers() {
    // Giữ nguyên hàm này
    revalidateTag('customers');
}

/* ============================================================
 * ACTION CHO BƯỚC 6 - CHỐT DỊCH VỤ (Chờ duyệt)
 * Yêu cầu:
 * - Lưu vào mảng serviceDetails (PUSH item mới) với approvalStatus='pending'
 * - Cho phép sửa/xóa khi còn pending
 * - Không cho sửa/xóa khi đã approved
 * ============================================================ */
export async function closeServiceAction(prevState, formData) {
    const session = await checkAuthToken();

    if (!session?.id) {
        return { success: false, error: 'Yêu cầu đăng nhập.' };
    }
    console.log('[closeServiceAction] formData:', formData);

    const customerId = String(formData.get('customerId') || '');
    const subStatus = String(formData.get('status') || 'in_progress'); // 'completed' | 'in_progress' | 'new'
    const revenueRaw = formData.get('revenue');
    // Parse mạnh tay: loại bỏ mọi ký tự không phải số, dấu chấm hoặc dấu âm
    const revenueNum = Number(String(revenueRaw ?? '').replace(/[^\d.-]/g, ''));
    const notes = String(formData.get('notes') || '');
    const invoiceImage = formData.get('invoiceImage');
    const selectedService = String(formData.get('selectedService') || '');

    if (!customerId || !subStatus) {
        return { success: false, error: 'Trạng thái và ID khách hàng là bắt buộc.' };
    }
    if (!isValidObjectId(customerId)) {
        return { success: false, error: 'customerId không hợp lệ.' };
    }
    if (!allowedServiceStatus.has(subStatus)) {
        return { success: false, error: 'Trạng thái không hợp lệ (new|in_progress|completed).' };
    }
    // Yêu cầu ảnh + dịch vụ hợp lệ (theo logic hiện tại của bạn)
    if (!invoiceImage || invoiceImage.size === 0) {
        return { success: false, error: 'Ảnh hóa đơn/hợp đồng là bắt buộc khi chốt dịch vụ.' };
    }
    if (!isValidObjectId(selectedService)) {
        return { success: false, error: 'Vui lòng chọn dịch vụ chốt hợp lệ.' };
    }

    try {
        await connectDB();

        // 1) Upload ảnh (nếu có)
        let uploadedFile = null;
        if (invoiceImage && invoiceImage.size > 0) {
            const folderId = '1wjg-eOTXIDhxc2ShNVN6AefdbKZmnH1h'
            uploadedFile = await uploadFileToDrive(invoiceImage, folderId);
            if (!uploadedFile?.id) {
                return { success: false, error: 'Tải ảnh lên không thành công. Vui lòng thử lại.' };
            }
        }

        // 2) Nạp customer, CHUẨN HOÁ serviceDetails thành MẢNG (fix legacy)
        const customerDoc = await Customer.findById(customerId);
        if (!customerDoc) return { success: false, error: 'Không tìm thấy khách hàng.' };

        if (!Array.isArray(customerDoc.serviceDetails)) {
            const legacy = customerDoc.serviceDetails;
            if (legacy && typeof legacy === 'object' && Object.keys(legacy).length > 0) {
                // bọc object cũ thành 1 phần tử trong mảng
                customerDoc.serviceDetails = [legacy];
            } else {
                customerDoc.serviceDetails = [];
            }
        }

        // 3) Tạo service detail mới (pending)
        const newServiceDetail = {
            approvalStatus: 'pending',
            status: subStatus,                         // 'new' | 'in_progress' | 'completed'
            revenue: Number.isFinite(revenueNum) ? revenueNum : 0,
            invoiceDriveId: uploadedFile ? uploadedFile.id : null,
            notes: notes || '',
            closedAt: new Date(),
            closedBy: session.id,
            selectedService,                           // ObjectId dịch vụ
            // pricing/payments/... để mặc định, admin chỉnh/duyệt sau
        };
        console.log(newServiceDetail, 2);

        customerDoc.serviceDetails.push(newServiceDetail);

        // 4) Cập nhật pipeline theo trạng thái
        const newPipelineStatus = pipelineFromServiceStatus(subStatus);
        customerDoc.pipelineStatus = customerDoc.pipelineStatus || [];
        customerDoc.pipelineStatus[0] = newPipelineStatus;
        customerDoc.pipelineStatus[6] = newPipelineStatus;

        // 5) Ghi care log
        const logContent = `[Chốt dịch vụ] Trạng thái: ${subStatus}. ${selectedService ? `Dịch vụ: ${selectedService}. ` : ''}Ghi chú: ${notes || 'Không có'}`;
        customerDoc.care = customerDoc.care || [];
        customerDoc.care.push({ content: logContent, createBy: session.id, createAt: new Date(), step: 6 });

        // 6) Lưu — sẽ trigger validate/recalc cho subdocs
        await customerDoc.save();

        revalidateData();
        return { success: true, message: 'Chốt dịch vụ thành công! Đơn đang chờ duyệt.' };
    } catch (error) {
        console.error('Lỗi khi chốt dịch vụ: ', error);
        return { success: false, error: 'Đã xảy ra lỗi phía máy chủ.' };
    }
}

/* ============================================================
 * ACTION CHO BƯỚC 4 - LƯU KẾT QUẢ CUỘC GỌI (Đã cập nhật)
 * ============================================================ */
export async function saveCallResultAction(prevState, formData) {
    const session = await checkAuthToken();
    if (!session?.id) {
        return { success: false, error: 'Yêu cầu đăng nhập.' };
    }

    const customerId = formData.get('customerId');
    const newStatus = formData.get('status');
    const callDuration = formData.get('callDuration');
    const callStartTime = formData.get('callStartTime');
    const recordingFile = formData.get('recordingFile');
    const recordingFileName = formData.get('recordingFileName'); // Giữ lại để trả về cho UI nếu cần

    if (!customerId || !newStatus || !recordingFile || recordingFile.size === 0) {
        return { success: false, error: 'Thiếu thông tin khách hàng, trạng thái hoặc file ghi âm.' };
    }

    try {
        await connectDB();

        // SỬ DỤNG HÀM MỚI: Tải file ghi âm lên
        const folderId = '1wjg-eOTXIDhxc2ShNVN6AefdbKZmnH1h'; // Cần thêm biến này
        const uploadedFile = await uploadFileToDrive(recordingFile, folderId);

        if (!uploadedFile?.id) {
            throw new Error('Tải file ghi âm lên Drive thất bại.');
        }

        // CẬP NHẬT: Lấy link trực tiếp từ kết quả trả về của hàm upload
        const callStartFormatted = new Date(callStartTime).toLocaleTimeString('vi-VN');
        const logContent = `Đã gọi ${callDuration} lúc ${callStartFormatted}. Trạng thái: ${newStatus}. Ghi âm: ${uploadedFile.webViewLink || 'đã lưu'
            }`;

        const careNote = {
            content: logContent,
            createBy: session.id,
            createAt: new Date(),
            step: 4,
        };

        await Customer.findByIdAndUpdate(customerId, {
            $set: {
                'pipelineStatus.0': newStatus,
                'pipelineStatus.3': newStatus,
            },
            $push: { care: careNote },
        });

        revalidateData();
        return {
            success: true,
            message: 'Đã lưu kết quả cuộc gọi thành công!',
            newRecording: {
                name: recordingFileName,
                driveLink: uploadedFile.webViewLink,
                status: 'uploaded',
            },
        };
    } catch (error) {
        console.error('Lỗi khi lưu kết quả cuộc gọi: ', error);
        return { success: false, error: `Đã xảy ra lỗi phía máy chủ: ${error.message}` };
    }
}

/* ============================================================
 * SỬA serviceDetails (CHỈ KHI PENDING)
 * - Cập nhật: status, notes, selectedService, pricing (nếu có), invoice
 * - Không cho sửa nếu approvalStatus='approved'
 * ============================================================ */
export async function updateServiceDetailAction(prevState, formData) {
    const session = await checkAuthToken();
    if (!session?.id) return { success: false, error: 'Yêu cầu đăng nhập.' };

    const customerId = String(formData.get('customerId') || '');
    const serviceDetailId = String(formData.get('serviceDetailId') || '');

    const statusRaw = formData.get('status') != null ? String(formData.get('status')) : undefined;
    const notes = formData.get('notes') != null ? String(formData.get('notes')) : undefined;
    const selectedService =
        formData.get('selectedService') != null ? String(formData.get('selectedService')) : undefined;

    const listPrice = formData.get('listPrice') != null ? Number(formData.get('listPrice')) : undefined;
    const discountType =
        formData.get('discountType') != null ? String(formData.get('discountType')) : undefined; // none|amount|percent
    const discountValue =
        formData.get('discountValue') != null ? Number(formData.get('discountValue')) : undefined;
    const finalPrice = formData.get('finalPrice') != null ? Number(formData.get('finalPrice')) : undefined;

    const invoiceImage = formData.get('invoiceImage');

    if (!isValidObjectId(customerId) || !isValidObjectId(serviceDetailId)) {
        return { success: false, error: 'customerId/serviceDetailId không hợp lệ.' };
    }
    if (statusRaw && !allowedServiceStatus.has(statusRaw)) {
        return { success: false, error: 'Trạng thái không hợp lệ (new|in_progress|completed).' };
    }
    if (selectedService && !isValidObjectId(selectedService)) {
        return { success: false, error: 'Dịch vụ chốt không hợp lệ.' };
    }

    try {
        await connectDB();

        const customer = await Customer.findById(customerId);
        if (!customer) return { success: false, error: 'Không tìm thấy khách hàng.' };

        const detail = customer.serviceDetails?.id(serviceDetailId);
        if (!detail) return { success: false, error: 'Không tìm thấy đơn chốt dịch vụ.' };
        if (detail.approvalStatus === 'approved') {
            return { success: false, error: 'Đơn đã duyệt. Không thể chỉnh sửa.' };
        }

        if (typeof statusRaw !== 'undefined') detail.status = statusRaw;
        if (typeof notes !== 'undefined') detail.notes = notes;
        if (typeof selectedService !== 'undefined') detail.selectedService = selectedService;

        if (
            typeof listPrice !== 'undefined' ||
            typeof discountType !== 'undefined' ||
            typeof discountValue !== 'undefined' ||
            typeof finalPrice !== 'undefined'
        ) {
            const current = detail.pricing || {};
            const next = { ...current };

            if (typeof listPrice === 'number' && Number.isFinite(listPrice)) next.listPrice = listPrice;

            if (typeof discountType !== 'undefined') {
                next.discountType = ['none', 'amount', 'percent'].includes(discountType)
                    ? discountType
                    : current.discountType || 'none';
            }

            if (typeof discountValue === 'number' && Number.isFinite(discountValue))
                next.discountValue = discountValue;

            if (typeof finalPrice === 'number' && Number.isFinite(finalPrice)) next.finalPrice = finalPrice;

            detail.pricing = next;
        }

        // Upload lại invoice (nếu có file mới)
        if (invoiceImage && invoiceImage.size > 0) {
            const folderId =
                process.env.GOOGLE_DRIVE_INVOICE_FOLDER_ID || '1epl-LSIM-ZgrcOCk2PglkCRZwXOFnprb';
            const uploadedFile = await uploadFileToDrive(invoiceImage, folderId);
            if (!uploadedFile?.id)
                return { success: false, error: 'Tải ảnh lên không thành công. Vui lòng thử lại.' };
            detail.invoiceDriveId = uploadedFile.id;
        }

        // Lưu để trigger validate hooks của subdoc (recalcMoney)
        await customer.save();

        // Cập nhật pipeline (nếu status thay đổi)
        const finalStatus = detail.status;
        const newPipeline = pipelineFromServiceStatus(finalStatus);
        await Customer.updateOne(
            { _id: customerId },
            {
                $set: {
                    'pipelineStatus.0': newPipeline,
                    'pipelineStatus.6': newPipeline,
                },
            }
        );

        await pushCareLog(
            customerId,
            `[Sửa đơn chốt] #${serviceDetailId} ${statusRaw ? `(status → ${finalStatus})` : ''}${notes ? ` | Ghi chú: ${notes}` : ''
            }`,
            session.id
        );

        revalidateData();
        return { success: true, message: 'Đã cập nhật đơn chốt (pending).' };
    } catch (error) {
        console.error('[updateServiceDetailAction] error:', error);
        return { success: false, error: 'Lỗi server khi cập nhật đơn chốt.' };
    }
}

/* ============================================================
 * XÓA serviceDetails (CHỈ KHI PENDING)
 * ============================================================ */
export async function deleteServiceDetailAction(prevState, formData) {
    const session = await checkAuthToken();
    if (!session?.id) return { success: false, error: 'Yêu cầu đăng nhập.' };

    const customerId = String(formData.get('customerId') || '');
    const serviceDetailId = String(formData.get('serviceDetailId') || '');

    if (!isValidObjectId(customerId) || !isValidObjectId(serviceDetailId)) {
        return { success: false, error: 'customerId/serviceDetailId không hợp lệ.' };
    }

    try {
        await connectDB();

        // Chỉ xóa khi approvalStatus = 'pending'
        const res = await Customer.updateOne(
            { _id: customerId },
            {
                $pull: {
                    serviceDetails: {
                        _id: new mongoose.Types.ObjectId(serviceDetailId),
                        approvalStatus: 'pending',
                    },
                },
            }
        );

        if (res.modifiedCount === 0) {
            return {
                success: false,
                error: 'Không thể xóa: đơn không ở trạng thái pending hoặc không tồn tại.',
            };
        }

        await pushCareLog(customerId, `[Xóa đơn chốt] #${serviceDetailId}`, session.id);

        revalidateData();
        return { success: true, message: 'Đã xóa đơn chốt (pending).' };
    } catch (error) {
        console.error('[deleteServiceDetailAction] error:', error);
        return { success: false, error: 'Lỗi server khi xóa đơn chốt.' };
    }
}

/* ============================================================
 * DUYỆT serviceDetails (PENDING → APPROVED; khóa sửa/xóa)
 * ============================================================ */
export async function approveServiceDetailAction(prevState, formData) {
    const session = await checkAuthToken();
    if (!session?.id) return { success: false, error: 'Yêu cầu đăng nhập.' };

    const customerId = String(formData.get('customerId') || '');
    const serviceDetailId = String(formData.get('serviceDetailId') || '');

    if (!isValidObjectId(customerId) || !isValidObjectId(serviceDetailId)) {
        return { success: false, error: 'customerId/serviceDetailId không hợp lệ.' };
    }

    try {
        await connectDB();
        const customer = await Customer.findById(customerId);
        if (!customer) return { success: false, error: 'Không tìm thấy khách hàng.' };

        const detail = customer.serviceDetails?.id(serviceDetailId);
        if (!detail) return { success: false, error: 'Không tìm thấy đơn chốt dịch vụ.' };
        if (detail.approvalStatus === 'approved')
            return { success: false, error: 'Đơn đã duyệt trước đó.' };

        detail.approvalStatus = 'approved';
        detail.approvedBy = session.id;
        detail.approvedAt = new Date();

        // Lưu để trigger validate hooks của subdoc (recalcMoney)
        await customer.save();

        // Cập nhật pipeline theo status của đơn
        const newPipeline = pipelineFromServiceStatus(detail.status);
        await Customer.updateOne(
            { _id: customerId },
            {
                $set: {
                    'pipelineStatus.0': newPipeline,
                    'pipelineStatus.6': newPipeline,
                },
            }
        );

        await pushCareLog(
            customerId,
            `[Duyệt đơn chốt] #${serviceDetailId} (status: ${detail.status})`,
            session.id
        );

        revalidateData();
        return { success: true, message: 'Đã duyệt đơn thành công.' };
    } catch (e) {
        console.error('[approveServiceDetailAction] error:', e);
        return { success: false, error: 'Lỗi server khi duyệt đơn.' };
    }
}

/* ============================================================
 * CÁC HÀM DUYỆT/REJECT CŨ (TƯƠNG THÍCH UI CŨ)
 * - ĐÃ ĐIỀU CHỈNH để làm việc theo serviceDetailId, serviceDetails[] và approvalStatus.
 * - Vui lòng truyền kèm serviceDetailId trong formData.
 * ============================================================ */

// ============= APPROVE DEAL (legacy-compatible) =============
export async function approveServiceDealAction(prevState, formData) {
    const session = await checkAuthToken();
    if (!session?.id) return { success: false, error: 'Yêu cầu đăng nhập.' };

    const customerId = String(formData.get('customerId') || '');
    const serviceDetailId = String(formData.get('serviceDetailId') || '');

    const listPrice = Number(formData.get('listPrice') || 0);
    const discountType = String(formData.get('discountType') || 'none');
    const discountValue = Number(formData.get('discountValue') || 0);
    const finalPrice = Number(formData.get('finalPrice') || 0);
    const revenue = Number(formData.get('revenue') || 0);
    const notes = String(formData.get('notes') || '');

    let commissions = [];
    let costs = [];
    try {
        commissions = JSON.parse(formData.get('commissions') || '[]');
        costs = JSON.parse(formData.get('costs') || '[]');
    } catch (_) { }

    if (!isValidObjectId(customerId) || !isValidObjectId(serviceDetailId)) {
        return { success: false, error: 'Thiếu hoặc sai customerId/serviceDetailId.' };
    }

    try {
        await connectDB();
        const customer = await Customer.findById(customerId);
        if (!customer) return { success: false, error: 'Không tìm thấy khách hàng.' };

        const detail = customer.serviceDetails?.id(serviceDetailId);
        if (!detail) return { success: false, error: 'Không tìm thấy đơn chốt dịch vụ.' };
        if (detail.approvalStatus === 'approved')
            return { success: false, error: 'Đơn đã duyệt trước đó.' };

        // Cập nhật dữ liệu đơn
        detail.notes = notes;
        detail.revenue = Number.isFinite(revenue) ? revenue : 0;
        detail.pricing = {
            listPrice,
            discountType: ['none', 'amount', 'percent'].includes(discountType) ? discountType : 'none',
            discountValue,
            finalPrice,
        };
        detail.commissions = (Array.isArray(commissions) ? commissions : []).map((x) => ({
            user: x.user,
            role: x.role,
            percent: Number(x.percent) || 0,
            amount: Number(x.amount) || 0,
        }));
        detail.costs = (Array.isArray(costs) ? costs : []).map((x) => ({
            label: x.label,
            amount: Number(x.amount) || 0,
        }));

        // Approve
        detail.approvalStatus = 'approved';
        detail.approvedBy = session.id;
        detail.approvedAt = new Date();

        await customer.save();

        const newPipeline = pipelineFromServiceStatus(detail.status);
        customer.pipelineStatus = customer.pipelineStatus || [];
        customer.pipelineStatus[0] = newPipeline;
        customer.pipelineStatus[6] = newPipeline;
        await customer.save();

        await pushCareLog(
            customerId,
            `Admin duyệt đơn chốt #${serviceDetailId} (revenue: ${Number(revenue).toLocaleString('vi-VN')}đ).`,
            session.id
        );

        revalidateData();
        return { success: true, message: 'Đã duyệt đơn thành công.' };
    } catch (e) {
        console.error('[approveServiceDealAction] error:', e);
        return { success: false, error: 'Lỗi server khi duyệt đơn.' };
    }
}

// ============= REJECT DEAL (legacy-compatible) =============
export async function rejectServiceDealAction(prevState, formData) {
    const session = await checkAuthToken();
    if (!session?.id) return { success: false, error: 'Yêu cầu đăng nhập.' };

    const customerId = String(formData.get('customerId') || '');
    const serviceDetailId = String(formData.get('serviceDetailId') || '');
    const reason = String(formData.get('reason') || '');

    if (!isValidObjectId(customerId) || !isValidObjectId(serviceDetailId)) {
        return { success: false, error: 'Thiếu hoặc sai customerId/serviceDetailId.' };
    }

    try {
        await connectDB();

        // Hành vi reject theo yêu cầu mới:
        // - Không có trạng thái "rejected" trong approvalStatus
        // - Ta coi reject là HỦY đơn pending (xóa item) + cập nhật pipeline rejected
        const res = await Customer.updateOne(
            { _id: customerId },
            {
                $pull: {
                    serviceDetails: {
                        _id: new mongoose.Types.ObjectId(serviceDetailId),
                        approvalStatus: 'pending',
                    },
                },
                $set: {
                    'pipelineStatus.0': 'rejected_after_consult_6',
                    'pipelineStatus.6': 'rejected_after_consult_6',
                },
            }
        );

        if (res.modifiedCount === 0) {
            return {
                success: false,
                error:
                    'Không thể từ chối: đơn không ở trạng thái pending hoặc không tồn tại.',
            };
        }

        await pushCareLog(
            customerId,
            `Admin từ chối đơn chốt #${serviceDetailId}${reason ? `: ${reason}` : ''}.`,
            session.id
        );

        revalidateData();
        return { success: true, message: 'Đã từ chối đơn.' };
    } catch (e) {
        console.error('[rejectServiceDealAction] error:', e);
        return { success: false, error: 'Lỗi server khi từ chối đơn.' };
    }
}
