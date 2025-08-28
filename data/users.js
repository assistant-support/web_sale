// data/users.js
"use server";

import connectDB from "@/config/connectDB";
import User from "@/models/users";
import ZaloAccount from "@/models/zalo";
import { revalidateTag } from "next/cache";

/**
 * Lấy thông tin user cơ bản để xác thực đăng nhập.
 * Chỉ lấy những trường cần thiết để tăng tốc độ và bảo mật.
 * @param {string} email - Email của người dùng cần tìm.
 * @returns {Promise<object|null>} - Trả về object user hoặc null.
 */
export async function getUserByEmailForAuth(email) {
  try {
    await connectDB();
    const user = await User.findOne({ email })
      .select("password name role")
      .lean();
    return JSON.parse(JSON.stringify(user));
  } catch (error) {
    console.error("Lỗi trong getUserByEmailForAuth:", error);
    return null;
  }
}

/**
 * Lấy danh sách các tài khoản Zalo mà một user được phép sử dụng.
 * @param {string} userId - ID của người dùng.
 * @returns {Promise<Array>} - Trả về một mảng các tài khoản Zalo.
 */
export async function getAvailableZaloAccounts(userId) {
  try {
    if (!userId) return [];
    await connectDB();
    // Tìm tất cả tài khoản Zalo có chứa userId trong mảng 'users'
    const accounts = await ZaloAccount.find({ users: userId }).lean();
    return JSON.parse(JSON.stringify(accounts));
  } catch (error) {
    console.error("Lỗi trong getAvailableZaloAccounts:", error);
    return [];
  }
}

/**
 * Làm mới cache cho dữ liệu user.
 */
export async function Re_user() {
  revalidateTag(`user`);
}

/**
 * Làm mới cache cho dữ liệu tài khoản Zalo.
 */
export async function Re_acc() {
  revalidateTag(`data_ac`);
}
