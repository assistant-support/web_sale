// ++ ADDED: Toàn bộ file này là mới
import { revalidateTag } from "next/cache";

/**
 * ++ ADDED: Hàm thông minh để lấy URL gốc chính xác trong mọi môi trường.
 * @returns {string} - URL gốc của ứng dụng.
 */
function getBaseUrl() {
  // 1. Ưu tiên biến VERCEL_URL do Vercel cung cấp tự động.
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`;
  }
  // 2. Nếu không có, tìm đến biến URL bạn đã tự cấu hình.
  if (process.env.URL) {
    return process.env.URL;
  }
  // 3. Nếu cả hai đều không có, mặc định là môi trường local.
  return "http://localhost:3000";
}

/**
 * Gửi một tín hiệu (broadcast) đến kênh sự kiện SSE.
 * Hàm này được thiết kế để "fire-and-forget", không cần chờ phản hồi.
 * @param {string} tag - Tag dữ liệu cần thông báo là đã thay đổi.
 */
function broadcast(tag) {
  // ** MODIFIED: Sử dụng hàm getBaseUrl() để có URL chính xác.
  const eventUrl = new URL("/api/events", getBaseUrl());

  console.log(`🚀 Sending revalidation signal to: ${eventUrl.toString()}`); // Thêm log để kiểm tra

  fetch(eventUrl.toString(), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ tag }),
  }).catch((error) => {
    // Ghi log lỗi nếu không thể gửi tín hiệu, nhưng không làm crash ứng dụng.
    console.error("❌ Lỗi khi gửi tín hiệu revalidation:", error.message);
  });
}

/**
 * Hàm thay thế cho revalidateTag và revalidatePath.
 * Nó sẽ thực hiện cả hai việc:
 * 1. Xóa cache dữ liệu ở phía Server (hành vi mặc định của Next.js).
 * 2. Gửi một "tín hiệu" đến tất cả các client đang kết nối để báo rằng dữ liệu đã thay đổi.
 * @param {string} tag - Tag định danh cho loại dữ liệu đã thay đổi.
 */
export async function revalidateAndBroadcast(tag) {
  if (!tag) return;

  // Bước 1: Xóa cache ở server.
  revalidateTag(tag);

  // Bước 2: Phát tín hiệu cho các client.
  broadcast(tag);
}
