// data/actions/appointment.actions.js
'use server'

import { getAppointmentsByCustomer, getAppointmentsByMonth, dataAppointments } from './handledata.db'
import { revalidateTag } from 'next/cache'

/**
 * Hàm tổng hợp để lấy dữ liệu lịch hẹn.
 * Sẽ tự động gọi hàm tương ứng dựa vào tham số đầu vào.
 * @param {object} params - Tham số truy vấn
 * @param {string} [params.customerId] - Lấy theo ID khách hàng.
 * @param {number} [params.year] - Lấy theo năm (phải đi kèm tháng).
 * @param {number} [params.month] - Lấy theo tháng (phải đi kèm năm).
 * @returns {Promise<Array>}
 */
export async function appointment_data(params) {
    if (params.customerId) {
        return await getAppointmentsByCustomer(params.customerId);
    }
    if (params.year && params.month) {
        return await getAppointmentsByMonth(params.year, params.month);
    }
    // Bạn có thể trả về mảng rỗng hoặc throw lỗi nếu không có tham số hợp lệ
    console.warn("appointment_data được gọi mà không có tham số hợp lệ.");
    return [];
}

export async function appointment_data_all() {
    return await dataAppointments();
}

/**
 * Xóa cache cho tất cả các truy vấn lịch hẹn.
 * Gọi hàm này sau khi thêm, sửa, hoặc xóa một lịch hẹn.
 */
export async function reloadAppointments() {
    revalidateTag('appointments');
}