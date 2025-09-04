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
// == ACTION CHO BƯỚC 6 - CHỐT DỊCH VỤ (Đã cập nhật)
// =============================================================
export async function closeServiceAction(prevState, formData) {
    const session = await checkAuthToken();
    if (!session?.id) {
        return { success: false, error: "Yêu cầu đăng nhập." };
    }

    const customerId = formData.get('customerId');
    const subStatus = formData.get('status');
    const revenue = formData.get('revenue');
    const tagsInput = formData.get('tags');
    const notes = formData.get('notes');
    const invoiceImage = formData.get('invoiceImage');

    if (!customerId || !subStatus) {
        return { success: false, error: "Trạng thái và ID khách hàng là bắt buộc." };
    }
    if (subStatus !== 'rejected' && (!invoiceImage || invoiceImage.size === 0)) {
        return { success: false, error: "Ảnh hóa đơn/hợp đồng là bắt buộc khi chốt dịch vụ." };
    }

    try {
        await connectDB();
        let uploadedFile = null;

        if (invoiceImage && invoiceImage.size > 0) {
            const folderId = process.env.GOOGLE_DRIVE_INVOICE_FOLDER_ID; // Lấy ID thư mục từ .env
            // SỬ DỤNG HÀM MỚI: Tải file lên và nhận về object { id, webViewLink }
            uploadedFile = await uploadFileToDrive(invoiceImage, folderId);
            if (!uploadedFile?.id) {
                return { success: false, error: "Tải ảnh lên không thành công. Vui lòng thử lại." };
            }
        }

        const statusMap = {
            completed: 'serviced_completed_6',
            in_progress: 'serviced_in_progress_6',
            rejected: 'rejected_after_consult_6'
        };
        const newPipelineStatus = statusMap[subStatus];

        if (!newPipelineStatus) {
            return { success: false, error: "Trạng thái chốt dịch vụ không hợp lệ." };
        }

        const serviceDetails = {
            status: subStatus,
            revenue: revenue ? parseFloat(revenue) : 0,
            // CẬP NHẬT: Lưu trữ ID của file từ object trả về
            invoiceDriveId: uploadedFile ? uploadedFile.id : null,
            notes: notes,
            closedAt: new Date(),
            closedBy: session.id,
            customTags: tagsInput ? tagsInput.split(',').map(tag => tag.trim()).filter(Boolean) : [],
        };

        const logContent = `[Chốt dịch vụ] Trạng thái: ${subStatus}. Ghi chú: ${notes || 'Không có'}`;
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
        return { success: true, message: "Chốt dịch vụ thành công!" };

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

