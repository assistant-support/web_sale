'use server'

import { revalidateTag } from 'next/cache';
import Customer from '@/models/customer.model';
// THAY ĐỔI: Import hàm upload file chung từ file action trên Canvas
import { uploadFileToDrive } from '@/function/drive/image';
import checkAuthToken from '@/utils/checktoken';
import connectDB from '@/config/connectDB';
import { revalidateData } from '@/app/actions/customer.actions';
import { getCustomersAll } from '@/data/customers/handledata.db';


export async function customer_data(params = {}) {
    // Giữ nguyên hàm này
    return await getCustomersAll();
}

export async function reloadCustomers() {
    // Giữ nguyên hàm này
    revalidateTag('customers');
}

// =============================================================
// == ACTION CHO BƯỚC 6 - CHỐT DỊCH VỤ (Chờ duyệt)
// =============================================================
export async function closeServiceAction(prevState, formData) {
    const session = await checkAuthToken();
    if (!session?.id) {
        return { success: false, error: "Yêu cầu đăng nhập." };
    }

    const customerId = formData.get('customerId');
    const subStatus = formData.get('status'); // completed | in_progress | rejected
    const revenue = formData.get('revenue');
    const notes = formData.get('notes');
    const invoiceImage = formData.get('invoiceImage');
    const selectedService = formData.get('selectedService'); // _id dịch vụ

    if (!customerId || !subStatus) {
        return { success: false, error: "Trạng thái và ID khách hàng là bắt buộc." };
    }

    // Nếu không phải 'rejected' → yêu cầu ảnh + dịch vụ hợp lệ
    if (subStatus !== 'rejected') {
        if (!invoiceImage || invoiceImage.size === 0) {
            return { success: false, error: "Ảnh hóa đơn/hợp đồng là bắt buộc khi chốt dịch vụ." };
        }
        if (!selectedService || !/^[0-9a-fA-F]{24}$/.test(String(selectedService))) {
            return { success: false, error: "Vui lòng chọn dịch vụ chốt hợp lệ." };
        }
    }

    try {
        await connectDB();
        let uploadedFile = null;

        if (invoiceImage && invoiceImage.size > 0) {
            const folderId = '1epl-LSIM-ZgrcOCk2PglkCRZwXOFnprb'; // => cân nhắc chuyển qua ENV
            uploadedFile = await uploadFileToDrive(invoiceImage, folderId);
            if (!uploadedFile?.id) {
                return { success: false, error: "Tải ảnh lên không thành công. Vui lòng thử lại." };
            }
        }

        // Pipeline: đưa về "đang xử lý" cho tới khi admin duyệt
        // Riêng 'rejected' thì vào trạng thái từ chối sau khám
        const newPipelineStatus =
            subStatus === 'rejected' ? 'rejected_after_consult_6' : 'serviced_in_progress_6';

        // Gom dữ liệu serviceDetails
        const serviceDetails = {
            status: subStatus,                                  // new | in_progress | completed (theo form)
            revenue: revenue ? parseFloat(revenue) : 0,         // số Sale nhập; admin sẽ duyệt/chỉnh sau
            invoiceDriveId: uploadedFile ? uploadedFile.id : null,
            notes: notes || '',
            closedAt: new Date(),
            closedBy: session.id,
            // chỉ set selectedService khi không phải rejected
            ...(subStatus !== 'rejected' && selectedService ? { selectedService } : {}),
            // Đưa đơn vào trạng thái chờ duyệt
            approval: {
                state: subStatus === 'rejected' ? 'approved' : 'pending', // nếu Sale đánh dấu rejected, coi như kết thúc
                approvedBy: subStatus === 'rejected' ? session.id : undefined,
                approvedAt: subStatus === 'rejected' ? new Date() : undefined,
                reason: subStatus === 'rejected' ? 'Sale xác nhận từ chối sau khám' : undefined
            }
        };

        const logContent = `[Chốt dịch vụ] Trạng thái: ${subStatus}. ${selectedService ? `Dịch vụ: ${selectedService}. ` : ''}Ghi chú: ${notes || 'Không có'}`;
        const careNote = {
            content: logContent, createBy: session.id, createAt: new Date(), step: 6
        };

        await Customer.findByIdAndUpdate(customerId, {
            $set: {
                'pipelineStatus.0': newPipelineStatus,
                'pipelineStatus.6': newPipelineStatus,
                serviceDetails: serviceDetails
            },
            $push: { care: careNote }
        });

        revalidateData();
        const msg = subStatus === 'rejected'
            ? "Đã cập nhật trạng thái từ chối sau khám."
            : "Chốt dịch vụ thành công! Đơn đang chờ duyệt.";
        return { success: true, message: msg };

    } catch (error) {
        console.error("Lỗi khi chốt dịch vụ: ", error);
        return { success: false, error: "Đã xảy ra lỗi phía máy chủ." };
    }
}

// =============================================================
// == ACTION CHO BƯỚC 4 - LƯU KẾT QUẢ CUỘC GỌI (Đã cập nhật)
// =============================================================
export async function saveCallResultAction(prevState, formData) {
    const session = await checkAuthToken();
    if (!session?.id) {
        return { success: false, error: "Yêu cầu đăng nhập." };
    }

    const customerId = formData.get('customerId');
    const newStatus = formData.get('status');
    const callDuration = formData.get('callDuration');
    const callStartTime = formData.get('callStartTime');
    const recordingFile = formData.get('recordingFile');
    const recordingFileName = formData.get('recordingFileName'); // Giữ lại để trả về cho UI nếu cần

    if (!customerId || !newStatus || !recordingFile || recordingFile.size === 0) {
        return { success: false, error: "Thiếu thông tin khách hàng, trạng thái hoặc file ghi âm." };
    }

    try {
        await connectDB();

        // SỬ DỤNG HÀM MỚI: Tải file ghi âm lên
        const folderId = process.env.GOOGLE_DRIVE_RECORDING_FOLDER_ID; // Cần thêm biến này
        const uploadedFile = await uploadFileToDrive(recordingFile, folderId);

        if (!uploadedFile?.id) {
            throw new Error("Tải file ghi âm lên Drive thất bại.");
        }

        // CẬP NHẬT: Lấy link trực tiếp từ kết quả trả về của hàm upload
        const callStartFormatted = new Date(callStartTime).toLocaleTimeString('vi-VN');
        const logContent = `Đã gọi ${callDuration} lúc ${callStartFormatted}. Trạng thái: ${newStatus}. Ghi âm: ${uploadedFile.webViewLink || 'đã lưu'}`;

        const careNote = {
            content: logContent, createBy: session.id, createAt: new Date(), step: 4
        };

        await Customer.findByIdAndUpdate(customerId, {
            $set: {
                'pipelineStatus.0': newStatus,
                'pipelineStatus.3': newStatus,
            },
            $push: { care: careNote }
        });

        revalidateData();
        return {
            success: true,
            message: "Đã lưu kết quả cuộc gọi thành công!",
            newRecording: {
                name: recordingFileName,
                driveLink: uploadedFile.webViewLink,
                status: 'uploaded'
            }
        };

    } catch (error) {
        console.error("Lỗi khi lưu kết quả cuộc gọi: ", error);
        return { success: false, error: `Đã xảy ra lỗi phía máy chủ: ${error.message}` };
    }
}

// ============= APPROVE DEAL =============
export async function approveServiceDealAction(prevState, formData) {
    const session = await checkAuthToken();
    if (!session?.id) return { success: false, error: 'Yêu cầu đăng nhập.' };

    const customerId = formData.get('customerId');
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

    if (!customerId) return { success: false, error: 'Thiếu customerId.' };

    try {
        await connectDB();
        const customer = await Customer.findById(customerId);
        if (!customer) return { success: false, error: 'Không tìm thấy khách hàng.' };

        // Giữ nguyên status sale đã chọn; chỉ cập nhật pipeline theo status
        const st = customer?.serviceDetails?.status || 'in_progress';
        const newPipeline = st === 'completed' ? 'serviced_completed_6' : 'serviced_in_progress_6';

        // Ghi cập nhật
        customer.serviceDetails = {
            ...(customer.serviceDetails?.toObject ? customer.serviceDetails.toObject() : customer.serviceDetails),
            notes,
            revenue, // doanh thu ghi nhận cuối
            pricing: {
                listPrice,
                discountType: ['none', 'amount', 'percent'].includes(discountType) ? discountType : 'none',
                discountValue,
                finalPrice
            },
            commissions: (Array.isArray(commissions) ? commissions : []).map(x => ({
                user: x.user, role: x.role, percent: Number(x.percent) || 0, amount: Number(x.amount) || 0
            })),
            costs: (Array.isArray(costs) ? costs : []).map(x => ({ label: x.label, amount: Number(x.amount) || 0 })),
            approval: {
                state: 'approved',
                approvedBy: session.id,
                approvedAt: new Date(),
                reason: ''
            }
        };

        // Pipeline bước 0 và 6
        customer.pipelineStatus = customer.pipelineStatus || [];
        customer.pipelineStatus[0] = newPipeline;
        customer.pipelineStatus[6] = newPipeline;

        await customer.save();

        // Care log
        await Customer.updateOne({ _id: customerId }, {
            $push: { care: { content: `Admin duyệt đơn chốt (revenue: ${revenue.toLocaleString('vi-VN')}đ).`, step: 6, createBy: session.id, createAt: new Date() } }
        });

        if (typeof revalidateData === 'function') await revalidateData();
        return { success: true, message: 'Đã duyệt đơn thành công.' };
    } catch (e) {
        console.error('[approveServiceDealAction] error:', e);
        return { success: false, error: 'Lỗi server khi duyệt đơn.' };
    }
}

// ============= REJECT DEAL =============
export async function rejectServiceDealAction(prevState, formData) {
    const session = await checkAuthToken();
    if (!session?.id) return { success: false, error: 'Yêu cầu đăng nhập.' };

    const customerId = formData.get('customerId');
    const reason = String(formData.get('reason') || '');

    if (!customerId) return { success: false, error: 'Thiếu customerId.' };

    try {
        await connectDB();
        const customer = await Customer.findById(customerId);
        if (!customer) return { success: false, error: 'Không tìm thấy khách hàng.' };

        customer.serviceDetails = {
            ...(customer.serviceDetails?.toObject ? customer.serviceDetails.toObject() : customer.serviceDetails),
            approval: {
                state: 'rejected',
                approvedBy: session.id,
                approvedAt: new Date(),
                reason
            }
        };

        // Pipeline → từ chối sau khám
        customer.pipelineStatus = customer.pipelineStatus || [];
        customer.pipelineStatus[0] = 'rejected_after_consult_6';
        customer.pipelineStatus[6] = 'rejected_after_consult_6';

        await customer.save();

        await Customer.updateOne({ _id: customerId }, {
            $push: { care: { content: `Admin từ chối đơn chốt${reason ? `: ${reason}` : ''}.`, step: 6, createBy: session.id, createAt: new Date() } }
        });

        if (typeof revalidateData === 'function') await revalidateData();
        return { success: true, message: 'Đã từ chối đơn.' };
    } catch (e) {
        console.error('[rejectServiceDealAction] error:', e);
        return { success: false, error: 'Lỗi server khi từ chối đơn.' };
    }
}