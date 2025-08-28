// app/(auth)/layout.js
import styles from "./layout.module.css";

// Layout này không cần `async` và không lấy dữ liệu
export default function AuthLayout({ children }) {
  return <div className={styles.container}>{children}</div>;
}
