// File: app/actions/zaloActions.js

"use server";

import { cookies } from "next/headers";
import connectDB from "@/config/connectDB";
import User from "@/models/users";
import ZaloAccount from "@/models/zalo";
import { revalidatePath } from "next/cache";
import { revalidateAndBroadcast } from "@/lib/revalidation";
import { jwtVerify } from "jose"; // Chỉ dùng để lấy userId

const COOKIE_NAME = "token";
const JWT_SECRET = new TextEncoder().encode(process.env.JWT_SECRET);

/**
 * Lấy danh sách các tài khoản Zalo mà user hiện tại được phép sử dụng.
 * @returns {Promise<Array>} - Mảng các tài khoản Zalo.
 */
export async function getAvailableZaloAccounts() {
  try {
    await connectDB();
    const token = await cookies().get(COOKIE_NAME)?.value;
    if (!token) return [];

    const { payload } = await jwtVerify(token, JWT_SECRET);
    const userId = payload.id;

    // Tìm tất cả tài khoản Zalo có chứa userId trong mảng 'users'
    const accounts = await ZaloAccount.find({ users: userId }).lean();
    return JSON.parse(JSON.stringify(accounts));
  } catch (error) {
    console.error("Lỗi khi lấy danh sách Zalo:", error);
    return [];
  }
}

/**
 * Cập nhật tài khoản Zalo đang hoạt động cho user.
 * Action này chỉ cập nhật DB và không can thiệp vào token.
 * @param {string | null} zaloAccountId - ID của tài khoản Zalo được chọn, hoặc chuỗi rỗng để bỏ chọn.
 * @returns {Promise<object>} - Trả về { success: true } hoặc { error: '...' }.
 */
export async function setActiveZalo(zaloAccountId) {
  try {
    await connectDB();
    const token = await cookies().get(COOKIE_NAME)?.value;
    if (!token) throw new Error("Yêu cầu đăng nhập.");

    const { payload } = await jwtVerify(token, JWT_SECRET);
    const userId = payload.id;

    // Nếu zaloAccountId là chuỗi rỗng/null, chúng ta sẽ bỏ chọn
    const activeId = zaloAccountId || null;

    if (activeId) {
      // Kiểm tra quyền truy cập nếu người dùng chọn một tài khoản cụ thể
      const hasAccess = await ZaloAccount.findOne({
        _id: activeId,
        users: userId,
      });
      if (!hasAccess) {
        throw new Error("Không có quyền truy cập tài khoản Zalo này.");
      }
    }

    // Cập nhật trường `zaloActive` trong document của User
    await User.findByIdAndUpdate(userId, { $set: { zaloActive: activeId } });

    // Yêu cầu Next.js làm mới dữ liệu ở các trang liên quan
    revalidateAndBroadcast("user_session");

    return { success: true, message: "Đã cập nhật tài khoản Zalo." };
  } catch (error) {
    console.error("Lỗi khi chọn Zalo:", error);
    return { error: error.message };
  }
}
