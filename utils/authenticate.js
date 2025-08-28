// utils/authenticate.js

export default async function authenticate(request) {
  // Lấy thông tin user từ header 'x-user-payload'
  const userPayloadHeader = request.headers.get("x-user-payload");

  if (!userPayloadHeader) {
    // Lỗi này có nghĩa là middleware đã không chạy hoặc không tìm thấy token
    throw new Error("Token không được cung cấp trong cookie");
  }

  try {
    const user = JSON.parse(userPayloadHeader);
    const body = await request.json().catch(() => null);

    // Trả về user (chỉ có id, role) và body của request
    return { user, body };
  } catch (e) {
    throw new Error("Xác thực thất bại: Dữ liệu user không hợp lệ.");
  }
}
