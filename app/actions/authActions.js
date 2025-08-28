// app/actions/authActions.js
"use server";

import { SignJWT } from "jose";
import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import connectDB from "@/config/connectDB";
import users from "@/models/users";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getUserByEmailForAuth } from "@/data/users"; // Import hàm truy vấn mới
import { logUserLogin } from "@/app/actions/historyActions"; // Import hàm ghi log
import { headers } from "next/headers";

const JWT_SECRET = new TextEncoder().encode(process.env.JWT_SECRET);
const COOKIE_NAME = "token";

/**
 * Xử lý logic đăng nhập cho người dùng.
 * Chỉ xác thực tài khoản web và tạo token cơ bản.
 * @param {object} prevState - Trạng thái trước đó (không dùng).
 * @param {FormData} formData - Dữ liệu từ form.
 * @returns {Promise<object>} - Trả về { success: true } hoặc { error: '...' }.
 */
export async function loginUser(prevState, formData) {
  const email = formData.get("email");
  const password = formData.get("password");
  let userId = null; // Khai báo userId để dùng cho việc ghi log

  const requestHeaders = headers();
  const ipAddress = requestHeaders.get("x-forwarded-for") || "unknown";
  const userAgent = requestHeaders.get("user-agent") || "unknown";

  try {
    const user = await getUserByEmailForAuth(email);
    if (!user) {
      throw new Error("Tài khoản không tồn tại!");
    }
    userId = user._id; // Lấy userId để ghi log nếu thất bại

    const isPasswordCorrect = await bcrypt.compare(password, user.password);
    if (!isPasswordCorrect) {
      // Ném lỗi với mật khẩu sai để khối catch có thể ghi log
      const incorrectPasswordError = new Error("Mật khẩu không chính xác!");
      incorrectPasswordError.passwordAttempt = password; // Gán mật khẩu sai vào lỗi
      throw incorrectPasswordError;
    }

    const tokenData = { id: user._id.toString(), role: user.role };
    const accessToken = await new SignJWT(tokenData)
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime("5h")
      .sign(JWT_SECRET);

    cookies().set(COOKIE_NAME, accessToken, {
      httpOnly: true,
      path: "/",
      maxAge: 5 * 60 * 60, // 5 giờ
    });

    // Ghi log hành động đăng nhập THÀNH CÔNG
    await logUserLogin("SUCCESS", user._id, { ipAddress, userAgent });
    console.log(
      `[LOG] User '${email}' đăng nhập thành công từ IP: ${ipAddress}`,
    );

    return { success: true, role: user.role };
  } catch (err) {
    if (userId) {
      await logUserLogin("FAILED", userId, {
        ipAddress,
        userAgent,
        reason: err.message,
        passwordAttempt: err.passwordAttempt,
      });
    }
    console.log(`[LOG] Đăng nhập thất bại cho '${email}': ${err.message}`);
    return { error: err.message };
  }
}

export async function logoutUser() {
  // Xóa cookie
  cookies().set(COOKIE_NAME, "", { maxAge: 0, path: "/" });
  // Chuyển hướng về trang đăng nhập
  redirect("/login");
}

// --- ACTION 3: ĐĂNG KÝ TÀI KHOẢN MỚI (DÀNH CHO ADMIN) ---
export async function registerUser(prevState, formData) {
  try {
    await connectDB();
    const name = formData.get("name");
    const email = formData.get("email");
    const password = formData.get("password");
    // Lấy role từ form, nếu không có thì mặc định là 'Employee'
    const role = formData.get("role") ? [formData.get("role")] : ["Employee"];

    if (!email || !password || !name) {
      return { error: "Tên, Email và mật khẩu là bắt buộc" };
    }

    const exists = await users.exists({ email });
    if (exists) {
      return { error: "Email đã tồn tại" };
    }

    const hash = await bcrypt.hash(password, 10);

    await users.create({ name, email, role, uid: hash });

    // Làm mới dữ liệu ở trang admin để danh sách user được cập nhật
    revalidatePath("/admin");
    return { success: "Tạo tài khoản thành công!" };
  } catch (err) {
    console.error(err);
    return { error: "Lỗi phía máy chủ khi tạo tài khoản." };
  }
}
