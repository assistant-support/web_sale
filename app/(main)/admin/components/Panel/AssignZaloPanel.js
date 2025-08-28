// ++ ADDED: File mới cho panel gán quyền TK Zalo
"use client";

import React, { useState, useEffect, useTransition } from "react";
import styles from "./DetailsPanel.module.css";
import {
  getZaloAccounts,
  toggleUserAccess,
} from "@/app/actions/zaloAccountActions";
import ZaloDisplay from "../shared/ZaloDisplay";
import LoadingSpinner from "../shared/LoadingSpinner";
import { usePanels } from "@/contexts/PanelContext";
import ZaloDetailsPanel from "./ZaloDetailsPanel";

export default function AssignZaloPanel({ user, onSuccess }) {
  const [allZalo, setAllZalo] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isPending, startTransition] = useTransition();
  const { openPanel, closePanel } = usePanels();

  const [assignedZaloIds, setAssignedZaloIds] = useState(
    () => new Set((user.zaloAccounts || []).map((a) => a._id.toString())),
  );

  useEffect(() => {
    const fetchZaloAccounts = async () => {
      setIsLoading(true);
      const result = await getZaloAccounts({ page: 1, limit: 999 }); // Get all accounts
      if (result.success) {
        setAllZalo(result.data);
      }
      setIsLoading(false);
    };
    fetchZaloAccounts();
  }, []);

  const handleToggle = (accountId) => {
    startTransition(async () => {
      // We can reuse the same toggle action, just with params reversed
      const result = await toggleUserAccess(accountId, user._id);
      if (result.success) {
        setAssignedZaloIds((prev) => {
          const next = new Set(prev);
          if (next.has(accountId)) next.delete(accountId);
          else next.add(accountId);
          return next;
        });
        onSuccess();
      } else {
        alert(`Lỗi: ${result.error}`);
      }
    });
  };

  const handleZaloClick = (account) => {
    const panelId = `zalo-details-${account._id}`;
    openPanel({
      id: panelId,
      title: `Chi tiết TK Zalo: ${account.name}`,
      component: ZaloDetailsPanel,
      props: {
        accountId: account._id,
        onClose: () => closePanel(panelId),
        onUpdate: onSuccess,
      },
    });
  };

  if (isLoading) return <LoadingSpinner />;

  return (
    <div className={styles.container}>
      <div className={styles.content} style={{ padding: 0 }}>
        <div className={styles.list}>
          {(allZalo || []).map((acc) => {
            const isAssigned = assignedZaloIds.has(acc._id.toString());
            return (
              <div
                key={acc._id}
                className={`${styles.listItem} ${styles.listItemAction}`}
                onClick={() => handleZaloClick(acc)}
              >
                <ZaloDisplay
                  name={acc.name}
                  phone={acc.phone}
                  avatar={acc.avt}
                />
                <button
                  onClick={() => handleToggle(acc._id)}
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
