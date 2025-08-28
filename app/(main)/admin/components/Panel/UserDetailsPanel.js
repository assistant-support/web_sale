// ++ ADDED: File mới cho panel chi tiết user
"use client";

import React, { useState, useEffect, useCallback, useTransition } from "react";
import styles from "./DetailsPanel.module.css";
import {
  getUserDetails,
  updateUserDetails,
  createUser,
} from "@/app/actions/userActions";
import { getCustomerDetails } from "@/app/actions/customerActions"; // ++ ADDED
import LoadingSpinner from "../shared/LoadingSpinner";
import UserDisplay from "../shared/UserDisplay";
import ZaloDisplay from "../shared/ZaloDisplay";
import { usePanels } from "@/contexts/PanelContext";
import AssignZaloPanel from "./AssignZaloPanel";
import ZaloDetailsPanel from "./ZaloDetailsPanel"; // Import để mở lồng panel
import CustomerDetails from "@/app/(main)/client/ui/details/CustomerDetails"; // Import để mở panel khách hàng
import CustomerDisplay from "../shared/CustomerDisplay";

// Tái sử dụng các component con từ ZaloDetailsPanel
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
            items.map((acc) => (
              <div
                key={acc._id}
                className={`${styles.listItem} ${styles.listItemAction}`}
                onDoubleClick={() => onDoubleClick(acc)}
              >
                <ZaloDisplay
                  name={acc.name}
                  phone={acc.phone}
                  avatar={acc.avt}
                />
              </div>
            ))
          ) : (
            <p className={styles.emptyText}>
              Chưa được gán tài khoản Zalo nào.
            </p>
          )}
        </div>
      )}
    </div>
  );
};

const EditableField = ({ label, value, name, type = "text", onSave }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [currentValue, setCurrentValue] = useState(value);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    setCurrentValue(value); // Cập nhật giá trị khi prop thay đổi
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
          {type === "textarea" ? (
            <textarea
              value={currentValue}
              onChange={(e) => setCurrentValue(e.target.value)}
              className={`${styles.input} ${styles.textareaScript}`}
            />
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
          <span className={type === "textarea" ? styles.scriptUrl : ""}>
            {value || "Chưa có"}
          </span>
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

export default function UserDetailsPanel({ userId, onUpdate, closePanel }) {
  const [user, setUser] = useState(null);
  const [isLoading, setIsLoading] = useState(!!userId);
  const { openPanel, closePanel: closeChildPanel } = usePanels();
  const isCreating = !userId;

  // State cho form tạo mới
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    phone: "",
    password: "",
  });

  const fetchData = useCallback(async () => {
    if (isCreating) return;
    const userData = await getUserDetails(userId);
    setUser(userData);
    setIsLoading(false);
  }, [userId, isCreating]);

  useEffect(() => {
    if (!isCreating) fetchData();
  }, [fetchData, isCreating]);

  const handleFieldChange = (fieldName, value) => {
    setFormData((prev) => ({ ...prev, [fieldName]: value }));
  };

  const handleCreate = async () => {
    const result = await createUser(formData);
    if (result.success) {
      alert("Tạo user thành công!");
      onUpdate();
      closePanel();
    } else {
      alert(`Lỗi: ${result.error}`);
    }
  };

  const handleFieldSave = async (fieldName, newValue) => {
    const result = await updateUserDetails(userId, { [fieldName]: newValue });
    if (result.success) {
      setUser((prev) => ({ ...prev, ...result.data }));
      onUpdate();
      return true;
    }
    alert(`Lỗi: ${result.error}`);
    return false;
  };

  const handleOpenAssignPanel = () => {
    const panelId = `assign-zalo-for-${userId}`;
    openPanel({
      id: panelId,
      title: `Gán TK Zalo cho: ${user.name}`,
      component: AssignZaloPanel,
      props: {
        user,
        onSuccess: async () => {
          await fetchData();
          onUpdate();
        },
      },
    });
  };
  const handleCustomerDoubleClick = async (customer) => {
    if (!customer?._id) return;
    const panelId = `details-${customer._id}`;

    // Lấy dữ liệu chi tiết đầy đủ của khách hàng trước khi mở panel
    const customerDetails = await getCustomerDetails(customer._id);

    if (customerDetails) {
      openPanel({
        id: panelId,
        component: CustomerDetails,
        title: `Chi tiết: ${customerDetails.name}`,
        props: {
          customerData: customerDetails,
          onUpdateCustomer: onUpdate, // Tải lại bảng user sau khi có thay đổi
        },
      });
    } else {
      alert("Không thể lấy thông tin chi tiết khách hàng.");
    }
  };

  const handleZaloDoubleClick = (account) => {
    const panelId = `zalo-details-${account._id}`;
    openPanel({
      id: panelId,
      title: `Chi tiết TK Zalo: ${account.name}`,
      component: ZaloDetailsPanel,
      props: {
        accountId: account._id,
        onUpdate: () => {
          fetchData();
          onUpdate();
        },
        closePanel: () => closeChildPanel(panelId),
      },
    });
  };

  if (isLoading) return <LoadingSpinner />;

  // ** MODIFIED: Sửa lỗi logic hiển thị
  if (!isCreating && !user) {
    return <div className={styles.error}>Không tìm thấy người dùng.</div>;
  }

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        {isCreating ? (
          <p className={styles.sectionTitle} style={{ border: "none" }}>
            Nhập thông tin User mới
          </p>
        ) : (
          user && <UserDisplay name={user.name} phone={user.phone} />
        )}
      </div>

      <div className={styles.content}>
        {isCreating ? (
          <div className={styles.section}>
            <h4 className={styles.sectionTitle}>Thông tin Bắt buộc</h4>
            <div className={styles.infoRow}>
              <label className={styles.infoLabel}>Tên User:</label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => handleFieldChange("name", e.target.value)}
                className={styles.input}
              />
            </div>
            <div className={styles.infoRow}>
              <label className={styles.infoLabel}>Email:</label>
              <input
                type="email"
                value={formData.email}
                onChange={(e) => handleFieldChange("email", e.target.value)}
                className={styles.input}
              />
            </div>
            <div className={styles.infoRow}>
              <label className={styles.infoLabel}>SĐT:</label>
              <input
                type="text"
                value={formData.phone}
                onChange={(e) => handleFieldChange("phone", e.target.value)}
                className={styles.input}
              />
            </div>
            <div className={styles.infoRow}>
              <label className={styles.infoLabel}>Mật khẩu:</label>
              <input
                type="password"
                value={formData.password}
                onChange={(e) => handleFieldChange("password", e.target.value)}
                className={styles.input}
              />
            </div>
          </div>
        ) : (
          user && (
            <>
              <div className={styles.section}>
                <h4 className={styles.sectionTitle}>Thông tin Cơ bản</h4>
                <EditableField
                  label="Tên User"
                  name="name"
                  value={user.name}
                  onSave={handleFieldSave}
                />
                <EditableField
                  label="Số điện thoại"
                  name="phone"
                  value={user.phone}
                  onSave={handleFieldSave}
                />
                <EditableField
                  label="Email"
                  name="email"
                  value={user.email}
                  onSave={handleFieldSave}
                />
                <div className={styles.infoRowReadOnly}>
                  <span className={styles.infoLabel}>Role:</span>
                  <span>{user.role}</span>
                </div>
              </div>
              {user?.latestAction?.customer?._id && (
                <div className={styles.section}>
                  <h4 className={styles.sectionTitle}>
                    Khách hàng Tương tác Gần nhất
                  </h4>
                  <div
                    className={`${styles.listItem} ${styles.listItemAction}`}
                    onDoubleClick={() =>
                      handleCustomerDoubleClick(user.latestAction.customer)
                    }
                  >
                    <CustomerDisplay
                      name={user.latestAction.customer.name}
                      phone={user.latestAction.customer.phone}
                    />
                  </div>
                </div>
              )}
              <CollapsibleList
                title="Tài khoản Zalo được gán"
                items={user.zaloAccounts || []}
                onDoubleClick={handleZaloDoubleClick}
              />
            </>
          )
        )}
      </div>

      <div className={styles.footer}>
        {isCreating ? (
          <button className={styles.primaryButton} onClick={handleCreate}>
            Tạo User
          </button>
        ) : (
          <>
            {" "}
            <button
              className={styles.secondaryButton}
              onClick={() =>
                alert("Chức năng đặt lại mật khẩu sẽ được phát triển sau.")
              }
            >
              Đặt lại mật khẩu
            </button>
            <button
              className={styles.primaryButton}
              onClick={handleOpenAssignPanel}
            >
              Gán / Thu hồi TK Zalo
            </button>
          </>
        )}
      </div>
    </div>
  );
}
