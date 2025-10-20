import { NextResponse } from 'next/server';
import authenticate from '@/utils/authenticate';
// import users from '@/models/users';

export async function POST(request) {
  try {
    const { user } = await authenticate(request);
    if (!user) {
      return NextResponse.json(
        { status: 1, mes: 'Xác thực thất bại!', data: [] },
        { status: 401, headers: { 'Content-Type': 'application/json' } }
      );
    }

    return NextResponse.json(
      { status: 2, mes: 'Kiểm tra phiên đăng nhập thành công!', data: user },
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  } catch (error) {
    console.log(error.message);

    return NextResponse.json(
      { status: 1, mes: `Lỗi: ${error.message}`, data: [] },
      {
        status: 500,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Content-Type': 'application/json',
        },
      }
    );
  }
}
