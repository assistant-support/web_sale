// components/(layout)/login/index.js
"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import styles from "./index.module.css";

// --- COMPONENT LOGIN CHÍNH (ĐÃ TÁI CẤU TRÚC VỚI UI MỚI) ---
const LoginPage = () => {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isPending, setIsPending] = useState(false);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setIsPending(true);
    setError("");

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "Đã có lỗi xảy ra.");
      }

      // Đăng nhập thành công, tiến hành điều hướng
      router.refresh(); // Làm mới session
      if (result.role === "Admin") {
        router.push("/admin");
      } else {
        router.push("/");
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setIsPending(false);
    }
  };

  return (
    <div className={styles.formContainer}>
      <h1 className={styles.title}>Đăng nhập</h1>
      <form onSubmit={handleSubmit}>
        <div className={styles.inputGroup}>
          <label htmlFor="email">Email</label>
          <input
            id="email"
            name="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={styles.inputField}
            required
            disabled={isPending}
          />
        </div>
        <div className={styles.inputGroup}>
          <label htmlFor="password">Mật khẩu</label>
          <input
            id="password"
            name="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={styles.inputField}
            required
            disabled={isPending}
          />
        </div>

        {error && <p className={styles.errorMessage}>{error}</p>}

        <button
          type="submit"
          className={styles.submitButton}
          disabled={isPending}
        >
          {isPending ? "Đang xử lý..." : "Đăng nhập"}
        </button>
      </form>
    </div>
  );
};

export default LoginPage;
