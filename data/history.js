// data/history.js
"use server";

import connectDB from "@/config/connectDB";
import ActionHistory from "@/models/history";

/**
 * Ghi lại một hành động của người dùng vào cơ sở dữ liệu.
 * Đây là hàm tiện ích có thể được gọi từ bất kỳ Server Action hoặc API Route nào.
 * @param {object} logData - Dữ liệu của hành động cần ghi lại.
 * @param {string} logData.action - Tên định danh của hành động (ví dụ: 'USER_LOGIN').
 * @param {string} logData.user - ID của người dùng thực hiện.
 * @param {'SUCCESS'|'FAILED'|'PENDING'} logData.status - Trạng thái hành động.
 * @param {string} [logData.target] - (Tùy chọn) ID của đối tượng khách hàng bị tác động.
 * @param {string} [logData.zaloActive] - (Tùy chọn) ID của tài khoản Zalo đang được sử dụng.
 * @param {object} [logData.actionDetail] - (Tùy chọn) Chi tiết bổ sung về hành động.
 * @returns {Promise<void>}
 */
export async function logAction(logData) {
  try {
    await connectDB();
    await ActionHistory.create(logData);
  } catch (error) {
    // Ghi log lỗi ra console nhưng không làm crash ứng dụng
    console.error("Lỗi khi ghi lịch sử hành động:", error);
  }
}
