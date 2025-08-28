// web_tslhu/app/(main)/client/ui/details/CustomerHistoryPanel.js
// -------------------- START: THAY THẾ TOÀN BỘ FILE --------------------
// Chú thích: Nâng cấp để hiển thị finalMessage.
"use client";

import React, { useState, useEffect, useTransition } from "react";
import styles from "./CustomerHistoryPanel.module.css";
import { getHistoryForCustomer } from "@/app/actions/historyActions";

const formatActionName = (action) => {
  const map = {
    DO_SCHEDULE_SEND_MESSAGE: "Gửi tin nhắn tự động",
    CREATE_SCHEDULE_SEND_MESSAGE: "Lên lịch gửi tin nhắn",
    DELETE_SCHEDULE_SEND_MESSAGE: "Xóa khỏi lịch gửi tin",
    DO_SCHEDULE_FIND_UID: "Tìm UID tự động",
    CREATE_SCHEDULE_FIND_UID: "Lên lịch tìm UID",
    DO_SCHEDULE_ADD_FRIEND: "Kết bạn tự động",
    CREATE_SCHEDULE_ADD_FRIEND: "Lên lịch kết bạn",
    UPDATE_NAME_CUSTOMER: "Cập nhật tên",
    UPDATE_STATUS_CUSTOMER: "Cập nhật trạng thái",
    UPDATE_STAGE_CUSTOMER: "Thay đổi giai đoạn",
    ADD_COMMENT_CUSTOMER: "Thêm bình luận",
  };
  return map[action] || action.replace(/_/g, " ").toLowerCase();
};

const ActionDetails = ({ log }) => {
  const { action, status, actionDetail } = log;
  const result = status.detail || {};

  const DetailRow = ({ label, value, isCode = false }) => (
    <div className={styles.detailRow}>
      <span className={styles.detailLabel}>{label}</span>
      <span className={`${styles.detailValue} ${isCode ? styles.code : ""}`}>
        {value}
      </span>
    </div>
  );

  const renderScheduleDetails = () => (
    <>
      {actionDetail.scheduleName && (
        <DetailRow label="Tên chiến dịch" value={actionDetail.scheduleName} />
      )}
      {result.actionMessage && (
        <DetailRow label="Kết quả" value={result.actionMessage} />
      )}
    </>
  );

  switch (action) {
    case "UPDATE_NAME_CUSTOMER":
      return (
        <DetailRow
          label="Thay đổi"
          value={`Từ "${actionDetail.oldName}" thành "${actionDetail.newName}"`}
        />
      );
    case "UPDATE_STATUS_CUSTOMER":
      return (
        <DetailRow
          label="Thay đổi"
          value={`Từ "${actionDetail.oldStatus}" thành "${actionDetail.newStatus}"`}
        />
      );
    case "UPDATE_STAGE_CUSTOMER":
      return (
        <DetailRow
          label="Thay đổi"
          value={`Từ giai đoạn "${actionDetail.oldStage}" sang "${actionDetail.newStage}"`}
        />
      );
    case "ADD_COMMENT_CUSTOMER":
      return <p>Đã thêm một bình luận mới vào hồ sơ.</p>;

    //<-----------------Thay đổi: Hiển thị finalMessage----------------->
    case "DO_SCHEDULE_SEND_MESSAGE":
      return (
        <>
          {renderScheduleDetails()}
          {(actionDetail.finalMessage || actionDetail.messageTemplate) && (
            <DetailRow
              label="Nội dung gửi"
              value={actionDetail.finalMessage || actionDetail.messageTemplate}
            />
          )}
        </>
      );

    case "DO_SCHEDULE_FIND_UID":
      let uidStatusMessage = "Không xác định";
      if (result.uidStatus === "found_new") {
        uidStatusMessage = "Tìm thấy UID mới";
      } else if (result.uidStatus === "already_exists") {
        uidStatusMessage = "UID đã tồn tại trong hệ thống";
      } else if (result.uidStatus === "not_found") {
        uidStatusMessage = "Không tìm thấy UID cho SĐT này";
      }
      return (
        <>
          {renderScheduleDetails()}
          <DetailRow label="Trạng thái tìm" value={uidStatusMessage} />
          {result.targetUid && (
            <DetailRow label="UID" value={result.targetUid} isCode={true} />
          )}
        </>
      );

    case "CREATE_SCHEDULE_SEND_MESSAGE":
    case "DELETE_SCHEDULE_SEND_MESSAGE":
    case "CREATE_SCHEDULE_FIND_UID":
      return (
        <DetailRow label="Tên chiến dịch" value={actionDetail.scheduleName} />
      );

    default:
      return (
        <DetailRow
          label="Kết quả"
          value={result.actionMessage || "Không có chi tiết."}
        />
      );
  }
};

const HistoryItem = ({ log }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const statusClass =
    log.status.status === "SUCCESS" ? styles.success : styles.failed;

  return (
    <div
      className={`${styles.item} ${statusClass}`}
      onClick={() => setIsExpanded(!isExpanded)}
    >
      <div className={styles.itemHeader}>
        <div className={styles.itemTitle}>
          <span className={styles.itemAction}>
            {formatActionName(log.action)}
          </span>
          <div className={styles.itemMeta}>
            <span>
              bởi <strong>{log.user?.name || "Hệ thống"}</strong>
            </span>
            {log.zalo && (
              <span>
                qua Zalo <strong>{log.zalo.name}</strong>
              </span>
            )}
          </div>
        </div>
        <span className={styles.itemTime}>
          {new Date(log.time).toLocaleString("vi-VN")}
        </span>
      </div>
      {isExpanded && (
        <div className={styles.itemBody}>
          <ActionDetails log={log} />
        </div>
      )}
    </div>
  );
};

export default function CustomerHistoryPanel({ panelData: { customerId } }) {
  const [history, setHistory] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (!customerId) return;
    startTransition(async () => {
      setIsLoading(true);
      const data = await getHistoryForCustomer(customerId);
      setHistory(data);
      setIsLoading(false);
    });
  }, [customerId]);

  if (isLoading)
    return <div className={styles.loading}>Đang tải lịch sử...</div>;

  return (
    <div className={styles.container}>
      <div className={styles.timeline}>
        {history.length > 0 ? (
          history.map((log) => <HistoryItem key={log._id} log={log} />)
        ) : (
          <p className={styles.noHistory}>Chưa có lịch sử tương tác.</p>
        )}
      </div>
    </div>
  );
}
// --------------------  END: THAY THẾ TOÀN BỘ FILE  --------------------
