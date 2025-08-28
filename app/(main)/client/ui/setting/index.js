// File: app/client/ui/setting/index.js

"use client";

import React, { useState, useEffect, useTransition, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Svg_Setting } from "@/components/(icon)/svg";
import styles from "./index.module.css";
import { usePanels } from "@/contexts/PanelContext";
import {
  setActiveZalo,
  getAvailableZaloAccounts,
} from "@/app/actions/zaloActions";
import Noti from "@/components/(features)/(noti)/noti";
import Loading from "@/components/(ui)/(loading)/loading";

// --- COMPONENT CON: NỘI DUNG PANEL QUẢN LÝ TÀI KHOẢN ---
// Component này giờ sẽ tự fetch dữ liệu Zalo khi được mount
const AccountManagerPanel = ({ user, onUpdate }) => {
  const router = useRouter();
  const [isSubmitting, startTransition] = useTransition();
  const [availableAccounts, setAvailableAccounts] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  // State để lưu trữ tài khoản đang active, lấy từ prop user
  const [activeZaloId, setActiveZaloId] = useState(
    user?.zaloActive?._id || null,
  );

  const [notification, setNotification] = useState({
    open: false,
    status: true,
    mes: "",
  });

  // Lấy danh sách tài khoản Zalo được gán cho user khi component được mở
  useEffect(() => {
    setIsLoading(true);
    getAvailableZaloAccounts()
      .then((accounts) => {
        setAvailableAccounts(accounts);
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, []);

  // Hàm xử lý khi người dùng chọn/bỏ chọn một tài khoản
  const handleAccountSelection = (accountId) => {
    startTransition(async () => {
      const result = await setActiveZalo(accountId);
      if (result.success) {
        setNotification({ open: true, status: true, mes: result.message });
        // Cập nhật state nội bộ ngay lập tức
        setActiveZaloId(accountId);
        // Gọi hàm onUpdate để ClientPage có thể refresh
        onUpdate();
      } else {
        setNotification({ open: true, status: false, mes: result.error });
      }
    });
  };

  // Tính toán tài khoản đang được chọn và danh sách còn lại
  const selectedAccount = useMemo(
    () => availableAccounts.find((acc) => acc._id === activeZaloId),
    [availableAccounts, activeZaloId],
  );

  const otherAccounts = useMemo(
    () => availableAccounts.filter((acc) => acc._id !== activeZaloId),
    [availableAccounts, activeZaloId],
  );

  if (isLoading) {
    return <Loading content="Đang tải danh sách tài khoản..." />;
  }

  return (
    <div className={styles.account_list_container}>
      <div className={styles.current_selection_section}>
        <h4 className={styles.section_title}>Tài khoản đang sử dụng</h4>
        {selectedAccount ? (
          <div className={`${styles.account_item} ${styles.selected_item}`}>
            <img
              src={selectedAccount.avt}
              alt={selectedAccount.name}
              className={styles.account_avatar}
            />
            <div className={styles.account_info}>
              <span className={styles.account_name}>
                {selectedAccount.name}
              </span>
            </div>
            <button
              onClick={() => handleAccountSelection(null)} // Bỏ chọn
              className={styles.deselect_btn}
              disabled={isSubmitting}
            >
              {isSubmitting ? "..." : "Bỏ chọn"}
            </button>
          </div>
        ) : (
          <div className={styles.no_account_selected}>
            <p>Chưa chọn tài khoản nào</p>
          </div>
        )}
      </div>

      {otherAccounts.length > 0 && (
        <div className={styles.available_list_section}>
          <h4 className={styles.section_title}>Chọn từ các tài khoản khác</h4>
          <div className={styles.account_list}>
            {otherAccounts.map((acc) => (
              <div
                key={acc._id}
                className={`${styles.account_item} ${styles.clickable} ${
                  isSubmitting ? styles.disabled : ""
                }`}
                onClick={() => !isSubmitting && handleAccountSelection(acc._id)}
              >
                <img
                  src={acc.avt}
                  alt={acc.name}
                  className={styles.account_avatar}
                />
                <div className={styles.account_info}>
                  <span className={styles.account_name}>{acc.name}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      <Noti
        open={notification.open}
        onClose={() => setNotification({ ...notification, open: false })}
        status={notification.status}
        mes={notification.mes}
      />
    </div>
  );
};

// --- COMPONENT CHÍNH (BUTTON KÍCH HOẠT) ---
export default function Setting({ user, onUserUpdate }) {
  // Nhận thêm prop onUserUpdate
  const { openPanel } = usePanels();

  const handleOpenAccountManager = () => {
    openPanel({
      id: "account-manager",
      title: "Quản lý tài khoản Zalo",
      component: AccountManagerPanel,
      props: {
        user: user,
        // Truyền hàm onUserUpdate xuống panel con
        onUpdate: onUserUpdate,
      },
    });
  };

  return (
    <div
      className="input"
      style={{
        cursor: "pointer",
        gap: 8,
        alignItems: "center",
        display: "flex",
        flex: 1,
        borderRadius: "0 5px 5px 0",
        background: "#e2e8f0",
      }}
      onClick={handleOpenAccountManager}
    >
      <Svg_Setting w={16} h={16} c={"var(--main_b)"} />
      <p className="text_6_400">Cấu hình</p>
    </div>
  );
}
