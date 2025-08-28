// lib/session.js
import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { jwtVerify } from "jose";

// --- START: THÊM CÁC IMPORT CẦN THIẾT ---
import connectDB from "@/config/connectDB"; // Import hàm kết nối DB
import User from "@/models/users"; // Import User model
import "@/models/zalo"; // Quan trọng: Import ZaloAccount model để populate() hoạt động
// --- END: THÊM CÁC IMPORT CẦN THIẾT ---

const JWT_SECRET = new TextEncoder().encode(process.env.JWT_SECRET);

/**
 * Lấy thông tin chi tiết của user đã xác thực, bao gồm cả tài khoản Zalo đang active.
 * Hàm này kết nối DB và populate dữ liệu, đảm bảo thông tin luôn mới nhất.
 * Dù được gọi nhiều lần, cache() của React sẽ đảm bảo nó chỉ thực thi một lần mỗi request.
 * @returns {Promise<object|null>} - Trả về object user đầy đủ, hoặc null nếu không hợp lệ.
 */
export const getCurrentUser = cache(async () => {
  const cookieStore = await cookies();
  const token = cookieStore.get("token")?.value;
  if (!token) return null;

  try {
    // 1. Giải mã token để lấy ID người dùng
    const { payload } = await jwtVerify(token, JWT_SECRET);
    if (!payload.id) {
      return null;
    }

    // 2. Kết nối đến cơ sở dữ liệu
    await connectDB();

    // 3. Tìm người dùng trong DB bằng ID từ token
    //    - Loại bỏ trường password vì lý do bảo mật.
    //    - Populate trường 'zaloActive' để lấy thông tin chi tiết.
    const user = await User.findById(payload.id)
      .select("-password")
      .populate("zaloActive") // <-- LOGIC CỐT LÕI ĐƯỢC THÊM VÀO
      .lean(); // .lean() để trả về object JS thuần, tăng hiệu năng

    if (!user) {
      return null;
    }

    // 4. Trả về đối tượng user hoàn chỉnh từ DB
    return JSON.parse(JSON.stringify(user));
  } catch (error) {
    console.error("Lỗi session:", error); // Log lỗi để debug
    return null;
  }
});
