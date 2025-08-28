// app/api/auth/login/route.js
import { NextResponse } from "next/server";
import { SignJWT } from "jose";
import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import User from "@/models/users";
import connectDB from "@/config/connectDB";

const JWT_SECRET = new TextEncoder().encode(process.env.JWT_SECRET);
const COOKIE_NAME = "token";

export async function POST(request) {
  try {
    await connectDB();
    const { email, password } = await request.json();

    if (!email || !password) {
      return NextResponse.json(
        { error: "Email và mật khẩu là bắt buộc." },
        { status: 400 },
      );
    }

    const user = await User.findOne({ email }).lean();
    if (!user) {
      return NextResponse.json(
        { error: "Tài khoản không tồn tại!" },
        { status: 404 },
      );
    }
    // console.log("--- Bắt đầu kiểm tra mật khẩu ---");
    // console.log("Mật khẩu từ form:", password);
    // console.log("Mật khẩu đã hash trong DB:", user.password);
    const isPasswordCorrect = await bcrypt.compare(password, user.password);
    if (!isPasswordCorrect) {
      return NextResponse.json(
        { error: "Mật khẩu không chính xác!" },
        { status: 401 },
      );
    }

    const tokenData = {
      id: user._id.toString(),
      role: user.role,
    };

    const accessToken = await new SignJWT(tokenData)
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime("5h")
      .sign(JWT_SECRET);

    cookies().set(COOKIE_NAME, accessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 5 * 60 * 60,
    });

    // Trả về role để client quyết định điều hướng
    return NextResponse.json({ success: true, role: user.role });
  } catch (err) {
    console.error("API Login Error:", err);
    return NextResponse.json({ error: "Lỗi phía máy chủ." }, { status: 500 });
  }
}
