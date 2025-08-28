// ++ ADDED: Toàn bộ file này là mới
import { revalidateTag } from "next/cache";

/**
 * Gửi một tín hiệu (broadcast) đến kênh sự kiện SSE.
 * Hàm này được thiết kế để "fire-and-forget", không cần chờ phản hồi.
 * @param {string} tag - Tag dữ liệu cần thông báo là đã thay đổi.
 */
function broadcast(tag) {
  // URL của API route sự kiện SSE của chúng ta.
  // Dùng full URL với biến môi trường để đảm bảo hoạt động tốt ở cả local và production.
  const eventUrl = new URL(
    "/api/events",
    process.env.URL || "http://localhost:3000",
  );

  // Gửi một yêu cầu POST đến kênh sự kiện một cách bất đồng bộ.
  // Chúng ta không cần `await` vì không cần chờ kết quả, chỉ cần "bắn" tín hiệu đi.
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
