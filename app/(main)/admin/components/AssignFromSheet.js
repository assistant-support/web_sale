"use client";

import React, { useState } from "react";
import styles from "../admin.module.css";

export default function AssignFromSheet() {
  // Chỉ giữ lại state cho các ô nhập liệu còn lại
  const [targetEmail, setTargetEmail] = useState("");
  const [startRow, setStartRow] = useState("");

  const [isLoading, setIsLoading] = useState(false);
  const [responseMessage, setResponseMessage] = useState("");
  const [isError, setIsError] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!targetEmail) {
      alert("Vui lòng nhập Email nhân viên.");
      return;
    }
    setIsLoading(true);
    setResponseMessage("");
    setIsError(false);

    try {
      // Payload giờ chỉ cần gửi các thông tin động
      const payload = {
        targetEmail,
        ...(startRow && { startRow: Number(startRow) }),
      };

      const res = await fetch("/api/client", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = await res.json();

      if (!res.ok || !result.status) {
        throw new Error(result.mes || "Có lỗi xảy ra.");
      }

      setResponseMessage(result.mes);
    } catch (error) {
      setIsError(true);
      setResponseMessage(error.message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div style={{ padding: "20px" }}>
      <h3 style={{ marginTop: 0 }}>Gán quyền từ Google Sheet</h3>
      <p style={{ fontSize: "14px", color: "#666" }}>
        Nhập thông tin để gán quyền chăm sóc khách hàng cho một nhân viên cụ thể
        từ file Google Sheet đã được cấu hình sẵn.
      </p>
      <form onSubmit={handleSubmit}>
        {/* Bỏ đi 2 ô nhập spreadsheetId và range */}
        <div className={styles.formGroup}>
          <label htmlFor="targetEmail">Email nhân viên cần gán</label>
          <input
            id="targetEmail"
            type="email"
            className={styles.input}
            value={targetEmail}
            onChange={(e) => setTargetEmail(e.target.value)}
            placeholder="Ví dụ: nhanvien@example.com"
            disabled={isLoading}
            required
          />
        </div>
        <div className={styles.formGroup}>
          <label htmlFor="startRow">Bắt đầu đọc từ dòng (Tùy chọn)</label>
          <input
            id="startRow"
            type="number"
            min="1"
            className={styles.input}
            value={startRow}
            onChange={(e) => setStartRow(e.target.value)}
            placeholder="Mặc định là dòng đầu tiên"
            disabled={isLoading}
          />
        </div>
        <button
          type="submit"
          className={styles.adminMenuItem}
          disabled={isLoading}
          style={{ marginTop: "10px" }}
        >
          {isLoading ? "Đang xử lý..." : "Bắt đầu gán quyền"}
        </button>
      </form>

      {responseMessage && (
        <div
          style={{
            marginTop: "20px",
            padding: "12px",
            borderRadius: "5px",
            border: "1px solid",
            borderColor: isError ? "red" : "green",
            backgroundColor: isError ? "#ffebee" : "#e8f5e9",
            color: isError ? "red" : "green",
          }}
        >
          {responseMessage}
        </div>
      )}
    </div>
  );
}
