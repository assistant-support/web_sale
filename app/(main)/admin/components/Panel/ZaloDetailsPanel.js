// ++ ADDED: File mới cho panel chi tiết tài khoản Zalo
"use client";

import React, { useState, useEffect, useCallback, useTransition } from "react";
import styles from "./DetailsPanel.module.css";
import {
  getZaloAccountDetails,
  updateZaloAccountDetails,
  createOrUpdateAccountByToken,
  getZaloTokenByUid, // ++ ADDED
} from "@/app/actions/zaloAccountActions";
import LoadingSpinner from "../shared/LoadingSpinner";
import ZaloDisplay from "../shared/ZaloDisplay";
import UserDisplay from "../shared/UserDisplay";
import { usePanels } from "@/contexts/PanelContext";
import AssignUserPanel from "./AssignUserPanel";
import UserDetailsPanel from "./UserDetailsPanel";
import UserTag from "../shared/UserTag";
import Switch from "@/components/(ui)/(button)/swith";

// Component này cho rõ ràng hơn
const InfoRow = ({ label, value, isCode = false }) => (
  <div className={styles.infoRowReadOnly}>
    <span className={styles.infoLabel}>{label}:</span>
    <span className={`${styles.infoValue} ${isCode ? styles.scriptUrl : ""}`}>
      {value || "N/A"}
    </span>
  </div>
);

// ... (CollapsibleList component không đổi)
const CollapsibleList = ({ title, items, onDoubleClick }) => {
  const [isOpen, setIsOpen] = useState(false);
  return (
    <div className={styles.collapsibleSection}>
      <button
        className={styles.collapsibleHeader}
        onClick={() => setIsOpen(!isOpen)}
      >
        <span>
          {title} ({items.length})
        </span>
        <span
          className={`${styles.chevron} ${isOpen ? styles.chevronOpen : ""}`}
        >
          ▼
        </span>
      </button>
      {isOpen && (
        <div className={styles.list}>
          {items.length > 0 ? (
            items.map((user) => (
              <div
                key={user._id}
                className={`${styles.listItem} ${styles.listItemAction}`}
                onDoubleClick={() => onDoubleClick(user)}
              >
                <UserTag user={user} />
              </div>
            ))
          ) : (
            <p className={styles.emptyText}>Chưa có nhân viên nào được gán.</p>
          )}
        </div>
      )}
    </div>
  );
};

// Component con cho phép chỉnh sửa trực tiếp
const EditableField = ({
  label,
  value,
  name,
  type = "number", // Mặc định là number cho rate limit
  onSave,
  children,
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [currentValue, setCurrentValue] = useState(value);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    setCurrentValue(value);
  }, [value]);

  const handleSave = () => {
    startTransition(async () => {
      const success = await onSave(name, currentValue);
      if (success) setIsEditing(false);
    });
  };

  return (
    <div className={styles.infoRow}>
      <span className={styles.infoLabel}>{label}:</span>
      {isEditing ? (
        <div className={styles.editGroup}>
          {children ? (
            React.cloneElement(children, {
              value: currentValue,
              onChange: (e) => setCurrentValue(e.target.value),
            })
          ) : (
            <input
              type={type}
              value={currentValue}
              onChange={(e) => setCurrentValue(e.target.value)}
              className={styles.input}
            />
          )}
          <button
            onClick={handleSave}
            className={styles.saveInlineBtn}
            disabled={isPending}
          >
            {isPending ? "..." : "Lưu"}
          </button>
          <button
            onClick={() => {
              setIsEditing(false);
              setCurrentValue(value);
            }}
            className={styles.cancelInlineBtn}
            disabled={isPending}
          >
            Hủy
          </button>
        </div>
      ) : (
        <div className={styles.valueGroup}>
          {/* ** MODIFIED: Áp dụng style scriptUrl cho tất cả các giá trị text dài */}
          <span className={styles.scriptUrl}>{value || "Chưa có"}</span>
          <button
            onClick={() => setIsEditing(true)}
            className={styles.editInlineBtn}
          >
            Sửa
          </button>
        </div>
      )}
    </div>
  );
};

// ++ ADDED: Component mới để hiển thị thông tin chỉ đọc
const ReadOnlyField = ({ label, value }) => (
  <div className={styles.infoRowReadOnly}>
    <span className={styles.infoLabel}>{label}:</span>
    <span className={styles.infoValue}>{value || "N/A"}</span>
  </div>
);

export default function ZaloDetailsPanel({ accountId, onUpdate, closePanel }) {
  const [account, setAccount] = useState(null);
  const [isLoading, setIsLoading] = useState(!!accountId);
  const { openPanel, closePanel: closeChildPanel } = usePanels();
  const isCreating = !accountId;
  const [tokenInput, setTokenInput] = useState("");
  const [isSubmitting, startTransition] = useTransition();

  const fetchData = useCallback(async () => {
    if (isCreating) return;
    setIsLoading(true);
    const accountData = await getZaloAccountDetails(accountId);
    setAccount(accountData);
    setIsLoading(false);

    // ++ ADDED: Lấy token sau khi đã có thông tin account
    if (accountData?.uid) {
      const token = await getZaloTokenByUid(accountData.uid);
      if (token) {
        setTokenInput(token);
      }
    }
  }, [accountId, isCreating]);

  useEffect(() => {
    if (!isCreating) fetchData();
  }, [fetchData, isCreating]);

  const handleOpenAssignPanel = () => {
    const panelId = `assign-user-for-${accountId}`;
    openPanel({
      id: panelId,
      title: `Gán quyền cho: ${account.name}`,
      component: AssignUserPanel,
      props: {
        account,
        onClose: () => closeChildPanel(panelId),
        onSuccess: async () => {
          await fetchData();
          onUpdate();
        },
      },
    });
  };

  const handleTokenSubmit = () => {
    startTransition(async () => {
      const result = await createOrUpdateAccountByToken(tokenInput);
      if (result.success) {
        alert("Xử lý token thành công!");
        onUpdate();
        if (isCreating) {
          closePanel();
        } else {
          setAccount(result.data);
          setTokenInput("");
        }
      } else {
        alert(`Lỗi: ${result.error}`);
      }
    });
  };

  const handleFieldSave = async (fieldName, newValue) => {
    const result = await updateZaloAccountDetails(accountId, {
      [fieldName]: newValue,
    });
    if (result.success) {
      setAccount(result.data);
      onUpdate();
      return true;
    }
    alert(`Lỗi: ${result.error}`);
    return false;
  };

  const handleUserDoubleClick = (user) => {
    const panelId = `user-details-${user._id}`;
    openPanel({
      id: panelId,
      title: `Chi tiết User: ${user.name}`,
      component: UserDetailsPanel,
      props: {
        userId: user._id,
        onUpdate,
        closePanel: () => closeChildPanel(panelId),
      },
    });
  };

  if (isLoading) return <LoadingSpinner />;
  if (!isCreating && !account)
    return <div className={styles.error}>Không tìm thấy tài khoản.</div>;

  // ** MODIFIED: Giao diện cho chế độ TẠO MỚI
  if (isCreating) {
    return (
      <div className={styles.container}>
        <div className={styles.header}>
          <p className={styles.sectionTitle} style={{ border: "none" }}>
            Thêm tài khoản Zalo mới bằng Token
          </p>
        </div>
        <div className={styles.content}>
          <div className={styles.section}>
            <div className={styles.infoRow}>
              <span className={styles.infoLabel}>Token:</span>
              <div className={styles.editGroup}>
                <textarea
                  value={tokenInput}
                  onChange={(e) => setTokenInput(e.target.value)}
                  className={`${styles.input} ${styles.textareaScript}`}
                  placeholder="Dán mã token lấy từ script vào đây..."
                />
              </div>
            </div>
          </div>
        </div>
        <div className={styles.footer}>
          <button
            className={styles.primaryButton}
            onClick={handleTokenSubmit}
            disabled={isSubmitting || !tokenInput.trim()}
          >
            {isSubmitting ? "Đang xử lý..." : "Thêm tài khoản"}
          </button>
        </div>
      </div>
    );
  }

  // ** MODIFIED: Giao diện cho chế độ CHỈNH SỬA
  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <ZaloDisplay
          name={account.name}
          phone={account.phone}
          avatar={account.avt}
        />
      </div>

      <div className={styles.content}>
        <CollapsibleList
          title="Nhân viên được gán"
          items={account.users || []}
          onDoubleClick={handleUserDoubleClick}
        />

        <div className={styles.section}>
          <h4 className={styles.sectionTitle}>Cập nhật Token & Trạng thái</h4>
          <div className={styles.infoRow}>
            <span className={styles.infoLabel}>Token mới:</span>
            <div className={styles.editGroup}>
              <textarea
                value={tokenInput}
                onChange={(e) => setTokenInput(e.target.value)}
                className={`${styles.input} ${styles.textareaScript}`}
                placeholder="Dán token mới để cập nhật thông tin"
              />
              <button
                onClick={handleTokenSubmit}
                className={styles.saveInlineBtn}
                disabled={isSubmitting || !tokenInput.trim()}
              >
                {isSubmitting ? "..." : "Cập nhật"}
              </button>
            </div>
          </div>
          <div className={styles.infoRow}>
            <span className={styles.infoLabel}>Token hoạt động:</span>
            <div className={styles.valueGroup}>
              <Switch
                checked={account.isTokenActive}
                onChange={(isChecked) =>
                  handleFieldSave("isTokenActive", isChecked)
                }
              />
            </div>
          </div>
        </div>

        <div className={styles.section}>
          <h4 className={styles.sectionTitle}>Thông tin Cơ bản & Script</h4>
          <InfoRow label="Tên tài khoản" value={account.name} />
          <InfoRow label="Số điện thoại" value={account.phone} />
          <InfoRow label="UID tài khoản" value={account.uid} isCode />
          <EditableField
            label="Script Action URL"
            name="action"
            value={account.action}
            type="textarea"
            onSave={handleFieldSave}
          />
        </div>

        <div className={styles.section}>
          <h4 className={styles.sectionTitle}>
            Thông số Giới hạn (Rate Limit)
          </h4>
          <EditableField
            label="Giới hạn / giờ"
            name="rateLimitPerHour"
            value={account.rateLimitPerHour}
            type="number"
            onSave={handleFieldSave}
          />
          <div
            className={styles.infoRowReadOnly}
            style={{ paddingTop: 0, border: "none" }}
          >
            <span className={styles.infoLabel}></span>
            <span style={{ fontSize: "11px", color: "#6b7280" }}>
              Đã dùng: {account.actionsUsedThisHour || 0} (Làm mới lúc:{" "}
              {new Date(account.rateLimitHourStart).toLocaleTimeString("vi-VN")}
              )
            </span>
          </div>

          <EditableField
            label="Giới hạn / ngày"
            name="rateLimitPerDay"
            value={account.rateLimitPerDay}
            type="number"
            onSave={handleFieldSave}
          />
          <div
            className={styles.infoRowReadOnly}
            style={{ paddingTop: 0, border: "none" }}
          >
            <span className={styles.infoLabel}></span>
            <span style={{ fontSize: "11px", color: "#6b7280" }}>
              Đã dùng: {account.actionsUsedThisDay || 0} (Làm mới lúc:{" "}
              {new Date(account.rateLimitDayStart).toLocaleDateString("vi-VN")})
            </span>
          </div>
        </div>
      </div>

      <div className={styles.footer}>
        <button
          className={styles.deleteButton}
          onClick={() => alert("Chức năng xóa sẽ được phát triển sau.")}
        >
          Xóa tài khoản
        </button>
        <button
          className={styles.primaryButton}
          onClick={handleOpenAssignPanel}
        >
          Gán / Thu hồi User
        </button>
      </div>
    </div>
  );
}
