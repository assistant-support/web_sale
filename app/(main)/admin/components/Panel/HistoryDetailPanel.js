"use client";

import React from "react";
import styles from "./PanelStyles.module.css";

const DetailRow = ({ label, value, isObject = false, isCode = false }) => (
  <div className={styles.detailRow}>
    <span className={styles.detailLabel}>{label}</span>
    {isObject ? (
      <pre className={styles.detailValueJson}>{value}</pre>
    ) : (
      <span className={`${styles.detailValue} ${isCode ? styles.code : ""}`}>
        {value}
      </span>
    )}
  </div>
);

const getSafeCustomerName = (customer) => {
  if (!customer) return "Không rõ";
  if (typeof customer.name === "object" && customer.name !== null) {
    return customer.name.name || "Dữ liệu tên lỗi";
  }
  return customer.name || "Không xác định";
};

export default function HistoryDetailPanel({ panelData: log }) {
  if (!log) return null;

  const { status, actionDetail, time, customer, action } = log;
  const executionResult = status.detail || {};

  const renderUidDetails = () => {
    let uidStatusMessage = "Không xác định";
    if (executionResult.uidStatus === "found_new") {
      uidStatusMessage = "✅ Tìm thấy UID mới";
    } else if (executionResult.uidStatus === "already_exists") {
      uidStatusMessage = "ℹ️ UID đã tồn tại, không cập nhật";
    } else if (executionResult.uidStatus === "not_found") {
      uidStatusMessage = "❌ Không tìm thấy UID cho SĐT này";
    }
    return (
      <>
        <DetailRow label="Trạng thái UID" value={uidStatusMessage} />
        {executionResult.targetUid && (
          <DetailRow
            label="UID"
            value={executionResult.targetUid}
            isCode={true}
          />
        )}
      </>
    );
  };

  return (
    <div className={styles.panelContent}>
      <div className={styles.detailGroup}>
        <DetailRow
          label="Trạng thái"
          value={status.status === "SUCCESS" ? "✅ Thành công" : "❌ Thất bại"}
        />
        <DetailRow
          label="Thời gian"
          value={new Date(time).toLocaleString("vi-VN")}
        />
        <DetailRow
          label="Thông điệp trả về"
          value={executionResult.actionMessage || "Không có"}
        />

        {/*<-----------------Thay đổi: Hiển thị chi tiết cho từng loại hành động----------------->*/}
        {action === "DO_SCHEDULE_SEND_MESSAGE" && (
          <DetailRow
            label="Nội dung đã gửi"
            value={
              actionDetail.finalMessage ||
              actionDetail.messageTemplate ||
              "Không có"
            }
            isObject={true}
          />
        )}

        {action === "DO_SCHEDULE_FIND_UID" && renderUidDetails()}
      </div>

      <h4 className={styles.contentTitle}>Dữ liệu gốc từ Script</h4>
      <div className={styles.detailGroup}>
        <DetailRow
          label="Toàn bộ kết quả"
          value={JSON.stringify(executionResult, null, 2)}
          isObject
        />
      </div>
    </div>
  );
}
