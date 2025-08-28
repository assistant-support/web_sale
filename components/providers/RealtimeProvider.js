// ++ ADDED: Toàn bộ file này là mới
"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export function RealtimeProvider({ children }) {
  const router = useRouter();

  useEffect(() => {
    // Sử dụng EventSource API gốc của trình duyệt để kết nối tới kênh SSE.
    const eventSource = new EventSource("/api/events");

    // Xử lý khi nhận được một tin nhắn từ server.
    const handleMessage = (event) => {
      try {
        const { tag } = JSON.parse(event.data);
        if (tag) {
          console.log(`✅ Nhận tín hiệu làm mới cho tag: '${tag}'`);
          // Đây là hành động cốt lõi: yêu cầu Next.js làm mới dữ liệu.
          router.refresh();
        }
      } catch (error) {
        console.error("Lỗi khi xử lý tin nhắn SSE:", error);
      }
    };

    eventSource.addEventListener("message", handleMessage);

    // Xử lý lỗi kết nối.
    eventSource.onerror = (err) => {
      console.error("Lỗi kết nối SSE:", err);
      // EventSource sẽ tự động cố gắng kết nối lại.
    };

    // Hàm dọn dẹp: đóng kết nối khi component bị unmount.
    return () => {
      eventSource.removeEventListener("message", handleMessage);
      eventSource.close();
    };
  }, [router]); // Phụ thuộc vào router.

  // Component này không render ra UI, chỉ cung cấp logic.
  return <>{children}</>;
}
