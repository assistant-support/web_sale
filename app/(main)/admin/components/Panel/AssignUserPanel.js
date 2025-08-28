// ++ ADDED: File mới cho panel gán quyền user
"use client";

import React, { useState, useEffect, useTransition } from "react";
import styles from "./DetailsPanel.module.css";
import {
  toggleUserAccess,
  getAllUsers,
} from "@/app/actions/zaloAccountActions";
import UserDisplay from "../shared/UserDisplay";
import LoadingSpinner from "../shared/LoadingSpinner";
import UserDetailsPanel from "./UserDetailsPanel";
import { usePanels } from "@/contexts/PanelContext";
import UserTag from "../shared/UserTag";

export default function AssignUserPanel({ account, onSuccess }) {
  const [allUsers, setAllUsers] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isPending, startTransition] = useTransition();
  const { openPanel, closePanel: closeGrandChildPanel } = usePanels();

  const handleUserDoubleClick = (user) => {
    const panelId = `user-details-${user._id}`;
    openPanel({
      id: panelId,
      title: `Chi tiết User: ${user.name}`,
      component: UserDetailsPanel,
      props: {
        userId: user._id,
        onUpdate: onSuccess,
        closePanel: () => closeGrandChildPanel(panelId),
      },
    });
  };

  const [assignedUserIds, setAssignedUserIds] = useState(
    () => new Set((account.users || []).map((u) => u._id.toString())),
  );

  useEffect(() => {
    const fetchUsers = async () => {
      setIsLoading(true);
      const usersData = await getAllUsers();
      setAllUsers(usersData);
      setIsLoading(false);
    };
    fetchUsers();
  }, []);

  const handleToggle = (userId) => {
    startTransition(async () => {
      const result = await toggleUserAccess(account._id, userId);
      if (result.success) {
        // Cập nhật lại state ở client để UI phản hồi ngay lập tức
        setAssignedUserIds((prev) => {
          const next = new Set(prev);
          if (next.has(userId)) {
            next.delete(userId);
          } else {
            next.add(userId);
          }
          return next;
        });
        onSuccess(); // Gọi callback để tải lại dữ liệu ở panel cha và bảng chính
      } else {
        alert(`Lỗi: ${result.error}`);
      }
    });
  };

  if (isLoading) return <LoadingSpinner />;

  return (
    <div className={styles.container}>
      <div className={styles.content} style={{ padding: 0 }}>
        <div className={styles.list}>
          {(allUsers || []).map((user) => {
            const isAssigned = assignedUserIds.has(user._id.toString());
            return (
              <div
                key={user._id}
                className={`${styles.listItem} ${styles.listItemAction}`}
                onDoubleClick={() => handleUserDoubleClick(user)}
              >
                <UserTag user={user} />
                <button
                  onClick={() => handleToggle(user._id)}
                  className={
                    isAssigned ? styles.revokeButton : styles.assignButton
                  }
                  disabled={isPending}
                >
                  {isPending ? "..." : isAssigned ? "Thu hồi" : "Gán quyền"}
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
