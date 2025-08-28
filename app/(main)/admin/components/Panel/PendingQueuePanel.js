// web_tslhu/app/(main)/admin/components/Panel/PendingQueuePanel.js
// -------------------- START: THAY ĐỔI TOÀN BỘ FILE --------------------
// Chú thích: Thêm số thứ tự (STT) vào đầu mỗi mục trong danh sách.
"use client";

import React, { useState, useMemo, useTransition } from "react";
import styles from "./PanelStyles.module.css";
import { usePanels } from "@/contexts/PanelContext";
import { getCustomerDetails } from "@/app/actions/customerActions";
import CustomerDetails from "@/app/(main)/client/ui/details/CustomerDetails";
import { removeTaskFromSchedule } from "@/app/actions/campaignActions";

export default function PendingQueuePanel({
  panelData: { job, onScheduleUpdate },
}) {
  const { openPanel } = usePanels();
  const [searchTerm, setSearchTerm] = useState("");
  const [isPending, startTransition] = useTransition();

  const handleDoubleClickCustomer = async (customer) => {
    if (!customer?._id) return;
    const customerDetails = await getCustomerDetails(customer._id);
    if (customerDetails) {
      openPanel({
        id: `details-${customer._id}`,
        component: CustomerDetails,
        title: `Chi tiết: ${customerDetails.name}`,
        props: {
          customerData: customerDetails,
          onUpdateInList: (updatedCustomer) => {
            setTasks((currentTasks) =>
              currentTasks.map((task) =>
                task.person._id === updatedCustomer._id
                  ? { ...task, person: updatedCustomer }
                  : task,
              ),
            );
          },
        },
      });
    } else {
      alert("Không thể lấy thông tin chi tiết khách hàng.");
    }
  };

  const pendingTasks = useMemo(() => {
    // ** MODIFIED: Lọc ra những task có status là 'pending'
    return (job.tasks || []).filter((task) => task.status === "pending");
  }, [job.tasks]);

  const filteredTasks = useMemo(() => {
    if (!searchTerm) return pendingTasks; // Lọc trên danh sách pendingTasks
    return pendingTasks.filter(
      (task) =>
        task.person.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        task.person.phone.includes(searchTerm),
    );
  }, [searchTerm, pendingTasks]);

  const handleRemoveTask = (taskId) => {
    if (confirm("Bạn có chắc muốn xóa người này khỏi hàng đợi không?")) {
      startTransition(async () => {
        const result = await removeTaskFromSchedule(job._id, taskId);
        if (result.success) {
          setTasks((prev) => prev.filter((t) => t._id !== taskId));
          onScheduleUpdate({
            type: "TASK_REMOVED",
            jobId: job._id,
            updatedJob: result.updatedJob,
          });
        } else {
          alert(`Lỗi: ${result.error}`);
        }
      });
    }
  };

  return (
    <div className={styles.panelContent}>
      <div className={styles.searchContainer}>
        <input
          type="text"
          placeholder="Tìm theo tên hoặc SĐT..."
          className={styles.searchInput}
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
      </div>
      <div className={styles.listContainer}>
        {/*<-----------------Thay đổi nhỏ: Thêm `index` vào hàm map----------------->*/}
        {filteredTasks.map((task, index) => (
          <div
            key={task._id}
            className={styles.listItem}
            onDoubleClick={() => handleDoubleClickCustomer(task.person)}
            title="Double-click để xem chi tiết khách hàng"
          >
            {/*<-----------------Thay đổi nhỏ: Thêm thẻ span cho STT----------------->*/}
            <span className={styles.itemIndex}>{index + 1}.</span>
            <div className={styles.listItemInfo}>
              <span className={styles.itemName}>{task.person.name}</span>
              <span className={styles.itemSubtext}>{task.person.phone}</span>
            </div>
            <div className={styles.listItemStatus}>
              🕒 {new Date(task.scheduledFor).toLocaleString("vi-VN")}
            </div>
            <button
              className={styles.deleteButton}
              onClick={(e) => {
                e.stopPropagation();
                handleRemoveTask(task._id);
              }}
              disabled={isPending}
              title="Xóa khỏi hàng đợi"
            >
              🗑️
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
// --------------------  END: THAY ĐỔI TOÀN BỘ FILE  --------------------
