'use server'

import { getCustomersAll } from './handledata.db';
import { revalidateTag } from 'next/cache';
import Customer from '@/models/customer.model';
import { uploadImageToDrive } from '@/function/drive/image';
import checkAuthToken from '@/utils/checktoken';


export async function customer_data(params = {}) {
    return await getCustomersAll();
}

export async function reloadCustomers() {
    revalidateTag('customers');
}

// =============================================================
// == ACTION CHO BƯỚC 6 - PHIÊN BẢN CHUẨN THEO SCHEMA
// =============================================================
export async function closeServiceAction(prevState, formData) {
    const session = await checkAuthToken();
    if (!session) {
        return { success: false, error: "Yêu cầu đăng nhập." };
    }

    // 1. Lấy dữ liệu từ FormData
    const customerId = formData.get('customerId');
    const subStatus = formData.get('status'); // 'completed', 'in_progress', 'rejected'
    const revenue = formData.get('revenue');
    const tagsInput = formData.get('tags');
    const notes = formData.get('notes');
    const invoiceImage = formData.get('invoiceImage');

    // 2. Validate dữ liệu
    if (!customerId || !subStatus) {
        return { success: false, error: "Trạng thái và ID khách hàng là bắt buộc." };
    }
    if (subStatus !== 'rejected' && (!invoiceImage || invoiceImage.size === 0)) {
        return { success: false, error: "Ảnh hóa đơn/hợp đồng là bắt buộc khi chốt dịch vụ." };
    }

    try {
        let invoiceDriveId = null;

        // 3. Tải ảnh lên Google Drive
        if (invoiceImage && invoiceImage.size > 0) {
            invoiceDriveId = await uploadImageToDrive(invoiceImage, process.env.GOOGLE_DRIVE_INVOICE_FOLDER_ID);
            if (!invoiceDriveId) {
                return { success: false, error: "Tải ảnh lên không thành công. Vui lòng thử lại." };
            }
        }

        // 4. Ánh xạ sang pipelineStatus chính từ schema
        const pipelineStatus = subStatus === 'rejected' ? 'rejected' : 'serviced';

        // Chuẩn bị object serviceDetails để lưu thông tin chi tiết
        const serviceDetails = {
            status: subStatus, // 'completed', 'in_progress', hoặc 'rejected'
            revenue: revenue ? parseFloat(revenue) : 0,
            invoiceDriveId: invoiceDriveId,
            notes: notes,
            closedAt: new Date(),
            closedBy: session.user._id,
            // Lưu các tag tùy chỉnh vào đây để không ảnh hưởng đến trường tags ObjectId
            customTags: tagsInput ? tagsInput.split(',').map(tag => tag.trim()).filter(Boolean) : [],
        };

        // Tạo care note để ghi log
        const logContent = `[Chốt dịch vụ] Trạng thái: ${subStatus}. Ghi chú: ${notes || 'Không có'}`;
        const careNote = {
            content: logContent,
            createBy: session.user._id,
            createAt: new Date(),
            step: 6
        };

        // 5. Cập nhật vào cơ sở dữ liệu
        await Customer.findByIdAndUpdate(customerId, {
            $set: {
                pipelineStatus: pipelineStatus,
                serviceDetails: serviceDetails // Thêm object mới này vào document
            },
            $push: {
                care: careNote // Thêm log vào mảng care
            }
        });

        // 6. Revalidate và trả về kết quả
        revalidateTag('customers');
        return { success: true, message: "Chốt dịch vụ thành công!" };

    } catch (error) {
        console.error("Lỗi khi chốt dịch vụ: ", error);
        return { success: false, error: "Đã xảy ra lỗi phía máy chủ." };
    }
}