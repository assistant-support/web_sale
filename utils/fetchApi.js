// utils/fetchApi.js
"use server";
// Lấy URL gốc của API từ biến môi trường để dễ dàng thay đổi
const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000/api";

async function fetchApi(endpoint, options = {}, token = null) {
  // Xây dựng URL đầy đủ
  const url = `${API_BASE_URL}${endpoint}`;

  // Chuẩn bị các header
  const headers = {
    "Content-Type": "application/json",
    ...options.headers, // Gộp các header được truyền vào (nếu có)
  };

  // Nếu có token, đính kèm nó vào header Authorization
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  // Cấu hình fetch cuối cùng
  const fetchOptions = {
    ...options,
    headers,
  };

  // Thực hiện gọi API
  const response = await fetch(url, fetchOptions);

  // Xử lý nếu response không thành công
  if (!response.ok) {
    const errorData = await response
      .json()
      .catch(() => ({ message: response.statusText }));
    console.error(`API Error on ${endpoint}:`, errorData);
    throw new Error(
      errorData.message || `Request failed with status ${response.status}`,
    );
  }

  // Trả về kết quả dưới dạng JSON
  return response.json();
}

export default fetchApi;
