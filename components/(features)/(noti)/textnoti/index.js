// components/(features)/(noti)/textnoti/index.js
import styles from "./index.module.css";

export default function TextNoti({ mes, title, color = "default" }) {
  // --- LOGIC MỚI ĐỂ XỬ LÝ MÀU SẮC ---
  // Tạo một object để ánh xạ 'color' prop sang className tương ứng trong CSS.
  const colorMap = {
    green: styles.green,
    red: styles.red,
    yellow: styles.yellow,
    default: styles.default,
  };

  // Lấy ra className tương ứng, nếu không tìm thấy thì dùng 'default'.
  const notificationClass = colorMap[color] || colorMap.default;
  // --- KẾT THÚC LOGIC MỚI ---

  return (
    // Áp dụng className đã tính toán vào div chính
    <div className={`${styles.container} ${notificationClass}`}>
      <p className="text_5" style={{ color: "var(--text-white)" }}>
        {title}
      </p>
      <p className="text_6_400" style={{ color: "var(--text-white)" }}>
        {mes}
      </p>
    </div>
  );
}
