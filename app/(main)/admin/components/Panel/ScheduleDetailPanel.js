// web_tslhu/app/(main)/admin/components/Panel/ScheduleDetailPanel.js
"use client";

import React, { useTransition } from "react";
import styles from "./ScheduleDetailPanel.module.css";
import { usePanels } from "@/contexts/PanelContext";
import { stopSchedule } from "@/app/actions/campaignActions";
import PendingQueuePanel from "./PendingQueuePanel";
import ExecutionHistoryPanel from "./ExecutionHistoryPanel";
import StackedProgressBar from "../shared/StackedProgressBar";

// Components con để code sạch hơn
const ActionButton = ({ onClick, label, icon, disabled }) => (
  <button className={styles.actionButton} onClick={onClick} disabled={disabled}>
    {icon}
    <span>{label}</span>
  </button>
);

const InfoRow = ({ icon, label, value }) => (
  <div className={styles.infoRow}>
    <span className={styles.infoIcon}>{icon}</span>
    <span className={styles.infoLabel}>{label}</span>
    <span className={styles.infoValue}>{value || "Không có"}</span>
  </div>
);

export default function ScheduleDetailPanel({
  panelData: job,
  closePanel,
  onScheduleUpdate,
  isArchived = false,
}) {
  const { openPanel } = usePanels();
  const [isPending, startTransition] = useTransition();

  const handleStopSchedule = () => {
    if (
      confirm(
        `Bạn có chắc muốn dừng và hủy vĩnh viễn lịch trình "${job.jobName}" không?`,
      )
    ) {
      startTransition(async () => {
        const result = await stopSchedule(job._id);
        if (result.error) {
          alert(`Lỗi: ${result.error}`);
        } else {
          onScheduleUpdate({ type: "STOP_SCHEDULE", jobId: job._id });
          closePanel();
        }
      });
    }
  };

  //<-----------------THAY ĐỔI: Sửa lỗi truyền props----------------->
  const handleOpenQueuePanel = () => {
    const panelId = `queue-${job._id}`;
    openPanel({
      id: panelId,
      title: `👥 Hàng đợi: ${job.jobName}`,
      component: PendingQueuePanel,
      props: {
        // Truyền đúng cấu trúc dữ liệu mà PendingQueuePanel mong đợi
        panelData: {
          job: job,
          onScheduleUpdate: onScheduleUpdate,
        },
      },
    });
  };

  const handleOpenHistoryPanel = () => {
    const panelId = `history-${job._id}`;
    openPanel({
      id: panelId,
      title: `📜 Lịch sử: ${job.jobName}`,
      component: ExecutionHistoryPanel,
      props: {
        panelData: {
          jobId: job._id,
          onScheduleUpdate: onScheduleUpdate,
        },
      },
    });
  };

  const st = job.statistics || { total: 0, completed: 0, failed: 0 };
  const tasks = job.tasks || [];

  // ++ ADDED: Tính toán số lượng task đang ở trạng thái 'pending'
  const pendingTaskCount = tasks.filter(
    (task) => task.status === "pending",
  ).length;

  return (
    <div className={styles.panelContainer}>
      <div className={styles.progressSection}>
        <h4 className={styles.sectionTitle}>Tổng quan kết quả</h4>
        <StackedProgressBar
          success={st.completed}
          failed={st.failed}
          total={st.total}
        />
      </div>

      <div className={styles.configSection}>
        <h4 className={styles.sectionTitle}>Chi tiết Cấu hình</h4>
        <InfoRow icon="📝" label="Tên chiến dịch" value={job.jobName} />
        <InfoRow icon="⚙️" label="Loại hành động" value={job.actionType} />
        <InfoRow
          icon="👤"
          label="Tài khoản Zalo"
          value={`${job.zaloAccount?.name} (${job.zaloAccount?.phone})`}
        />
        <InfoRow
          icon="🧑‍💻"
          label="Người tạo lịch"
          value={`${job.createdBy?.name} (${job.createdBy?.email})`}
        />
        <InfoRow
          icon="⚡"
          label="Tốc độ"
          value={`${job.config?.actionsPerHour || 50} hđ/giờ`}
        />
        {/* ++ ADDED: Hiển thị kết quả thực thi cuối cùng */}
        <InfoRow
          icon="📋"
          label="Kết quả cuối"
          value={job.lastExecutionResult}
        />
        <InfoRow
          icon="⏰"
          label="Tạo lúc"
          value={new Date(job.createdAt).toLocaleString("vi-VN")}
        />
        {isArchived ? (
          <InfoRow
            icon="✅"
            label="Hoàn thành lúc"
            value={new Date(job.completedAt).toLocaleString("vi-VN")}
          />
        ) : (
          <InfoRow
            icon="🏁"
            label="Dự kiến xong"
            value={new Date(job.estimatedCompletionTime).toLocaleString(
              "vi-VN",
            )}
          />
        )}
      </div>

      <div className={styles.actionsContainer}>
        <ActionButton
          // ** MODIFIED: Sử dụng biến đếm mới `pendingTaskCount`
          label={`Hàng đợi (${pendingTaskCount})`}
          icon="👥"
          onClick={handleOpenQueuePanel}
          disabled={isArchived}
        />
        <ActionButton
          label="Lịch sử thực thi"
          icon="📜"
          onClick={handleOpenHistoryPanel}
        />
      </div>

      {job.actionType === "sendMessage" && job.config.messageTemplate && (
        <div className={styles.messageSection}>
          <h4>Nội dung tin nhắn</h4>
          <pre className={styles.messageContent}>
            {job.config.messageTemplate}
          </pre>
        </div>
      )}

      {!isArchived && (
        <div className={styles.panelFooter}>
          <button
            onClick={handleStopSchedule}
            className={styles.stopButton}
            disabled={isPending}
          >
            {isPending ? "Đang xử lý..." : "Dừng & Hủy Lịch trình"}
          </button>
        </div>
      )}
    </div>
  );
}
