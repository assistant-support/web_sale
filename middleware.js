// middleware.js
import { NextResponse } from "next/server";
import { jwtVerify } from "jose";

const JWT_SECRET = new TextEncoder().encode(process.env.JWT_SECRET);
const COOKIE_NAME = "token";

export async function middleware(request) {
  const { pathname } = request.nextUrl;
  const token = request.cookies.get(COOKIE_NAME)?.value;

  if (!token) {
    // THÊM LỐI ĐI RIÊNG: Nếu là API đăng nhập, cho phép đi tiếp
    if (pathname === "/api/auth/login") {
      return NextResponse.next();
    }

    // Nếu là các API khác, chặn lại
    if (pathname.startsWith("/api")) {
      return NextResponse.json(
        { message: "Yêu cầu xác thực" },
        { status: 401 },
      );
    }

    // Nếu là trang khác ngoài login, điều hướng về login
    if (!pathname.startsWith("/login")) {
      return NextResponse.redirect(new URL("/login", request.url));
    }

    return NextResponse.next();
  }

  // --- LOGIC KHI CÓ TOKEN ---
  try {
    // Xác thực token
    const { payload } = await jwtVerify(token, JWT_SECRET);

    // "Đóng dấu" thông tin user vào header của request
    const requestHeaders = new Headers(request.headers);
    requestHeaders.set("x-user-payload", JSON.stringify(payload));

    // Tạo một response cho phép đi tiếp với header đã được cập nhật
    const response = NextResponse.next({
      request: { headers: requestHeaders },
    });

    // Xử lý logic chuyển hướng cho các trang (pages)
    if (pathname.startsWith("/login")) {
      return NextResponse.redirect(new URL("/", request.url));
    }

    const isAdmin = payload.role === "Admin";
    if (
      (pathname.startsWith("/admin") || pathname.startsWith("/dev")) &&
      !isAdmin
    ) {
      return NextResponse.redirect(new URL("/", request.url));
    }

    return response; // Trả về response đã được "đóng dấu"
  } catch (err) {
    // Nếu token không hợp lệ, xóa cookie và điều hướng/trả lỗi
    if (pathname.startsWith("/api")) {
      return NextResponse.json(
        { message: "Xác thực thất bại" },
        { status: 401 },
      );
    }
    const response = NextResponse.redirect(new URL("/login", request.url));
    response.cookies.delete(COOKIE_NAME);
    return response;
  }
}

// Cấu hình để middleware chạy trên TẤT CẢ các đường dẫn, trừ các file tĩnh
export const config = {
  matcher: [
    /*
     * Khớp với tất cả các đường dẫn YÊU CẦU XÁC THỰC, NGOẠI TRỪ những đường dẫn:
     * - /api/action (CRON job của chúng ta)
     * - /api/auth/... (các API đăng nhập, đăng ký)
     * - _next/static (các file static)
     * - _next/image (tối ưu hóa hình ảnh)
     * - favicon.ico (icon của trang)
     */
    "/((?!api/action|api/resetgetuid|api/auth|_next/static|_next/image|favicon.ico).*)",
  ],
};
