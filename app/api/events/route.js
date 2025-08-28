// ++ ADDED: Toàn bộ file này là mới
import { EventEmitter } from "events";

// Tạo một đối tượng EventEmitter để quản lý các sự kiện trong bộ nhớ.
// Lưu ý: Giải pháp này hoạt động tốt trên một server instance duy nhất.
// Đối với môi trường serverless (như Vercel), cần giải pháp phức tạp hơn
// như Redis Pub/Sub, nhưng để bắt đầu thì đây là cách đơn giản và hiệu quả.
const emitter = new EventEmitter();

// Tăng giới hạn listener để tránh warning khi có nhiều client kết nối
emitter.setMaxListeners(100);

/**
 * GET Handler: Xử lý việc client kết nối đến kênh SSE.
 */
export async function GET(request) {
  // Tạo một ReadableStream để gửi dữ liệu liên tục cho client.
  const stream = new ReadableStream({
    start(controller) {
      // Định nghĩa hàm listener sẽ được gọi mỗi khi có sự kiện 'revalidate'.
      const listener = (tag) => {
        // Gói dữ liệu theo định dạng của SSE và gửi đi.
        controller.enqueue(`data: ${JSON.stringify({ tag })}\n\n`);
      };

      // Đăng ký listener vào emitter.
      emitter.on("revalidate", listener);

      // Khi client ngắt kết nối (đóng tab, F5), dọn dẹp listener.
      request.signal.addEventListener("abort", () => {
        emitter.off("revalidate", listener);
        controller.close();
      });
    },
  });

  // Trả về một Response với stream và các header cần thiết cho SSE.
  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      Connection: "keep-alive",
      "Cache-Control": "no-cache, no-transform",
    },
  });
}

/**
 * POST Handler: Nhận tín hiệu từ Server Actions và phát nó đi.
 */
export async function POST(request) {
  try {
    const { tag } = await request.json();
    if (tag) {
      // Khi nhận được tag, phát một sự kiện 'revalidate' với tag đó.
      // Tất cả các listener (các client đang kết nối) sẽ nhận được sự kiện này.
      emitter.emit("revalidate", tag);
    }
    return new Response(null, { status: 204 }); // Phản hồi thành công, không có nội dung.
  } catch (error) {
    return new Response("Invalid request body", { status: 400 });
  }
}
