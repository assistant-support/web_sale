// File: app/client/ui/details/CustomerDetails.js

"use client";

import React, { useState, useEffect, useCallback } from "react";
import styles from "./CustomerDetails.module.css";

// --- IMPORT THÀNH PHẦN & CONTEXT ---
import { usePanels } from "@/contexts/PanelContext";
import { useCampaigns } from "@/contexts/CampaignContext";
import {
  Svg_History,
  Svg_Notes,
  Svg_Edit,
  Svg_Pen,
  Svg_Send,
} from "@/components/(icon)/svg";
import Loading from "@/components/(ui)/(loading)/loading";
import StageIndicator from "@/components/(ui)/progress/StageIndicator";
import TextNoti from "@/components/(features)/(noti)/textnoti";
import Schedule from "../schedule";
import CustomerHistoryPanel from "./CustomerHistoryPanel";

//================================================================================
// --- HELPER COMPONENTS (Thành phần phụ trợ) ---
//================================================================================

/**
 * Component InfoRow: Hiển thị một dòng thông tin theo cặp "Nhãn" và "Giá trị".
 * @param {string} label - Nhãn hiển thị bên trái.
 * @param {string|React.ReactNode} value - Giá trị hiển thị bên phải.
 * @param {React.ReactNode} children - Các nút hoặc component con đi kèm.
 * @param {string} statusColor - Màu trạng thái (nếu có) để styling.
 */
const InfoRow = ({ label, value, children, statusColor }) => (
  <div className={styles.infoRow}>
    <span className={styles.infoLabel}>{label}</span>
    <div className={styles.infoValue}>
      {statusColor ? (
        <span className={styles.statusTag} data-status={statusColor}>
          {value}
        </span>
      ) : (
        value
      )}
      {children}
    </div>
  </div>
);

/**
 * Component StageSelector: Hiển thị các bước của giai đoạn chăm sóc và cho phép lựa chọn.
 * @param {number} currentLevel - Mức giai đoạn hiện tại.
 * @param {function} onSelect - Hàm callback được gọi khi một giai đoạn được chọn.
 */
const StageSelector = ({ currentLevel, onSelect }) => {
  const stages = ["Chưa có", "Chăm sóc", "OTP", "Nhập học"];
  return (
    <div className={styles.stageSelector}>
      {stages.map((stage, index) => (
        <div
          key={index}
          className={`${styles.stageStep} ${
            currentLevel === index ? styles.active : ""
          }`}
          onClick={() => onSelect(index)}
        >
          <div className={styles.stageDot}></div>
          <div className={styles.stageLabel}>{stage}</div>
        </div>
      ))}
    </div>
  );
};

/**
 * Định dạng thời gian thành dạng tương đối (vd: 5 phút trước)
 * @param {Date | string} date - Thời gian cần định dạng
 */
function formatRelativeTime(date) {
  const now = new Date();
  const seconds = Math.round((now - new Date(date)) / 1000);
  const minutes = Math.round(seconds / 60);
  const hours = Math.round(minutes / 60);
  const days = Math.round(hours / 24);
  const months = Math.round(days / 30.44);
  const years = Math.round(days / 365.25);

  if (seconds < 60) return "vài giây trước";
  if (minutes < 60) return `${minutes} phút trước`;
  if (hours < 24) return `${hours} giờ trước`;
  if (days < 30) return `${days} ngày trước`;
  if (months < 12) return `${months} tháng trước`;
  return `${years} năm trước`;
}

const CommentSection = ({ customer, user, onUpdateCustomer }) => {
  const [newComment, setNewComment] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleAddComment = async () => {
    if (!newComment.trim()) return;
    setIsSubmitting(true);
    try {
      // GỌI ĐẾN API PATCH THỐNG NHẤT
      const res = await fetch(`/api/client`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerId: customer._id,
          // Gửi payload đặc biệt để API nhận biết đây là yêu cầu thêm comment
          updateData: { _comment: newComment },
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || "Thêm bình luận thất bại");
      }

      const responseJson = await res.json();

      // Gọi callback onUpdateCustomer để kích hoạt hiệu ứng làm mới
      onUpdateCustomer(responseJson.data);
      setNewComment(""); // Xóa nội dung trong ô nhập
    } catch (error) {
      alert(`Lỗi: ${error.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className={styles.commentSection}>
      {/* --- Ô NHẬP BÌNH LUẬN --- */}
      <div className={styles.commentInputArea}>
        <textarea
          className={styles.commentTextarea}
          placeholder="Viết bình luận..."
          value={newComment}
          onChange={(e) => setNewComment(e.target.value)}
          rows={2}
          disabled={isSubmitting}
        />
        <button
          className={styles.commentSubmitButton}
          onClick={handleAddComment}
          disabled={isSubmitting || !newComment.trim()}
        >
          {isSubmitting ? (
            <Loading small />
          ) : (
            <Svg_Send w={18} h={18} c={"currentColor"} />
          )}
        </button>
      </div>

      {/* --- HEADER DANH SÁCH BÌNH LUẬN --- */}
      <div className={styles.commentListHeader}>
        <span>Sắp xếp theo: Mới nhất</span>
        <span className={styles.commentCount}>
          {customer.comments?.length || 0} bình luận
        </span>
      </div>

      {/* --- DANH SÁCH BÌNH LUẬN --- */}
      <div className={styles.commentList}>
        {customer.comments && customer.comments.length > 0 ? (
          customer.comments.map((comment) => (
            <div key={comment._id} className={styles.commentItem}>
              {/* Icon Giai đoạn */}
              <div className={styles.commentStageIcon}>
                <span>GĐ</span>
                <strong>{comment.stage}</strong>
              </div>
              <div className={styles.commentContent}>
                <div className={styles.commentHeader}>
                  <span className={styles.commentUser}>
                    {comment.user?.name || "Một nhân viên"}
                  </span>
                  <span className={styles.commentTime}>
                    {formatRelativeTime(comment.time)}
                  </span>
                </div>
                <p className={styles.commentDetail}>{comment.detail}</p>
              </div>
            </div>
          ))
        ) : (
          <p className={styles.noComments}>Chưa có bình luận nào.</p>
        )}
      </div>
    </div>
  );
};
//================================================================================
// --- MAIN COMPONENT (Thành phần chính) ---
//================================================================================

export default function CustomerDetails({
  customerData,
  onUpdateCustomer,
  user,
  initialLabels,
  statuses,
  onRecipientToggle,
}) {
  //----------------------------------------------------------------
  // --- STATE MANAGEMENT (Quản lý State) ---
  //----------------------------------------------------------------

  // State chính: lưu trữ bản sao của dữ liệu khách hàng để component tự quản lý.
  const [customer, setCustomer] = useState(customerData);

  // State cho các giá trị có thể chỉnh sửa trên form.
  const [editableName, setEditableName] = useState(customerData.name || "");
  const [editableStatus, setEditableStatus] = useState(
    customerData.status?._id || "",
  );
  const [editableStageLevel, setEditableStageLevel] = useState(
    customerData.stageLevel || 0,
  );
  const [editableNotes, setEditableNotes] = useState({
    careNote: customerData.careNote || "",
    studyTryNote: customerData.studyTryNote || "",
    studyNote: customerData.studyNote || "",
  });

  // State quản lý trạng thái UI (hiển thị/ẩn các thành phần).
  const [isEditingName, setIsEditingName] = useState(false);
  const [isNoteVisible, setNoteVisible] = useState(false);
  const [isStatusSelectorVisible, setStatusSelectorVisible] = useState(false);
  const [showCampaignList, setShowCampaignList] = useState(false);

  // State cho hệ thống thông báo.
  const [notification, setNotification] = useState({
    show: false,
    title: "",
    mes: "",
    color: "default",
  });

  //----------------------------------------------------------------
  // --- HOOKS ---
  //----------------------------------------------------------------

  const { openPanel } = usePanels();
  const { drafts, addRecipientToDraft } = useCampaigns();

  /**
   * 🧠 **LOGIC CỐT LÕI**: Đồng bộ hóa state nội bộ với props từ bên ngoài.
   * Hook này sẽ chạy lại MỖI KHI prop `customerData` thay đổi.
   * Đây là giải pháp cho vấn đề "panel không render lại" khi dữ liệu được cập nhật từ nơi khác.
   */
  useEffect(() => {
    // 1. Cập nhật state chính của component.
    setCustomer(customerData);

    // 2. Đồng bộ hóa tất cả các state dùng cho việc chỉnh sửa trên form.
    setEditableName(customerData.name || "");
    setEditableStatus(customerData.status?._id || "");
    setEditableStageLevel(customerData.stageLevel || 0);
    setEditableNotes({
      careNote: customerData.careNote || "",
      studyTryNote: customerData.studyTryNote || "",
      studyNote: customerData.studyNote || "",
    });
  }, [customerData]);

  // Hook để tự động ẩn thông báo sau 3 giây.
  useEffect(() => {
    if (!notification.show) return;
    const timerId = setTimeout(
      () => setNotification((prev) => ({ ...prev, show: false })),
      3000,
    );
    // Hàm dọn dẹp: hủy bộ đếm giờ nếu component bị unmount.
    return () => clearTimeout(timerId);
  }, [notification.show]);

  //----------------------------------------------------------------
  // --- HANDLERS (Hàm xử lý sự kiện) ---
  //----------------------------------------------------------------

  /**
   * Lưu một trường dữ liệu cụ thể về server.
   * @param {string} fieldName - Tên của trường cần cập nhật (ví dụ: 'name', 'stageLevel').
   * @param {*} value - Giá trị mới của trường đó.
   */
  const handleSaveField = async (fieldName, value) => {
    try {
      const res = await fetch(`/api/client`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerId: customer._id,
          updateData: { [fieldName]: value }, // Cập nhật động
        }),
      });

      if (!res.ok) throw new Error("Cập nhật thất bại");
      const responseJson = await res.json();

      // Gọi callback để cập nhật dữ liệu ở component cha, kích hoạt re-render toàn cục.
      onUpdateCustomer(responseJson.data);

      if (fieldName === "name") setIsEditingName(false);

      setNotification({
        show: true,
        title: "Thành công",
        mes: "Đã cập nhật thông tin.",
        color: "green",
      });
    } catch (error) {
      setNotification({
        show: true,
        title: "Lỗi",
        mes: error.message,
        color: "red",
      });
    }
  };

  /**
   * Cập nhật trạng thái chăm sóc của khách hàng.
   */
  const handleUpdateStatus = async () => {
    if (!editableStatus) {
      setNotification({
        show: true,
        title: "Cảnh báo",
        mes: "Vui lòng chọn một trạng thái.",
        color: "yellow",
      });
      return;
    }
    await handleSaveField("status", editableStatus);
    setStatusSelectorVisible(false); // Ẩn dropdown sau khi lưu
  };

  /**
   * Xóa trạng thái chăm sóc của khách hàng.
   */
  const handleDeleteStatus = async () => {
    if (
      !window.confirm(
        "Bạn có chắc chắn muốn xóa trạng thái của khách hàng này không?",
      )
    ) {
      return;
    }
    // Gọi hàm handleSaveField với giá trị `null` để API hiểu là "xóa"
    await handleSaveField("status", null);
    setStatusSelectorVisible(false); // Ẩn dropdown
  };

  /**
   * Mở panel "Lên lịch nhanh" cho khách hàng hiện tại.
   */
  const handleOpenActionPanel = () => {
    // BƯỚC KIỂM TRA AN TOÀN: Đảm bảo user và user.zalo tồn tại
    if (!user || !user.zaloActive) {
      setNotification({
        show: true,
        title: "Lỗi",
        mes: "Không tìm thấy thông tin tài khoản Zalo. Vui lòng kiểm tra lại.",
        color: "red",
      });
      return; // Dừng hàm tại đây nếu không có user
    }

    // Nếu user hợp lệ, tiếp tục mở panel như bình thường
    const singleRecipientMap = new Map([[customerData._id, customerData]]);
    openPanel({
      id: `action-${customerData._id}`,
      component: Schedule,
      title: `Hành động cho: ${customerData.name}`,
      props: {
        initialData: [customerData],
        // recipientsMap và onRecipientToggle có thể không cần thiết nếu Schedule không dùng,
        // nhưng giữ lại cũng không sao
        onRecipientToggle: onRecipientToggle,
        user: user, // Bây giờ `user` chắc chắn hợp lệ
        label: initialLabels,
      },
    });
  };

  /**
   * Mở tab mới để đến trang cập nhật thông tin tuyển sinh.
   */
  const handleUpdateLookup = () => {
    if (customer?.MaDangKy) {
      const url = `https://xettuyen.lhu.edu.vn/cap-nhat-thong-tin-xet-tuyen-dai-hoc?id=${encodeURIComponent(
        customer.MaDangKy,
      )}&htx=0`;
      window.open(url, "_blank");
    }
  };

  const handleShowHistory = (customer) => {
    if (!customer) return;
    const panelId = `history-${customer._id}`;
    openPanel({
      id: panelId,
      title: `Lịch sử tương tác: ${customer.name}`,
      component: CustomerHistoryPanel,
      props: {
        panelData: { customerId: customer._id },
      },
    });
  };

  //----------------------------------------------------------------
  // --- UTILITY FUNCTIONS (Hàm tiện ích) ---
  //----------------------------------------------------------------

  const getStatusColor = (tinhTrang) => {
    if (tinhTrang === "Không có thông tin" || tinhTrang === "Lỗi tra cứu")
      return "error";
    if (tinhTrang === "Thiếu thông tin") return "warning";
    if (tinhTrang === "Đủ đúng không xét tuyển") return "success";
    if (tinhTrang) return "found";
    return "not-found";
  };

  //----------------------------------------------------------------
  // --- RENDER ---
  //----------------------------------------------------------------

  if (!customer) {
    return (
      <div className={styles.loadingContainer}>
        <Loading />
      </div>
    );
  }

  return (
    <div className={styles.container}>
      {/* Vùng hiển thị thông báo */}
      {notification.show && (
        <div className={styles.notificationContainer}>
          <TextNoti
            title={notification.title}
            mes={notification.mes}
            color={notification.color}
          />
        </div>
      )}

      <div className={styles.content}>
        {/* === SECTION: THÔNG TIN CƠ BẢN === */}
        <div className={styles.section}>
          <h3 className={styles.sectionTitle}>Thông tin cơ bản</h3>
          <div className={styles.infoRow}>
            <span className={styles.infoLabel}>Tên khách hàng</span>
            <div className={styles.infoValue}>
              {isEditingName ? (
                <div className={styles.editInputContainer}>
                  <input
                    type="text"
                    value={editableName}
                    onChange={(e) => setEditableName(e.target.value)}
                    className={styles.inlineInput}
                    autoFocus
                  />
                  <button
                    onClick={() => handleSaveField("name", editableName)}
                    className={styles.inlineSaveButton}
                  >
                    Lưu
                  </button>
                  <button
                    onClick={() => setIsEditingName(false)}
                    className={styles.inlineCancelButton}
                  >
                    Hủy
                  </button>
                </div>
              ) : (
                <>
                  <span>{customer.name || "(chưa có tên)"}</span>
                  <button
                    onClick={() => setIsEditingName(true)}
                    className={styles.inlineButton}
                  >
                    <Svg_Edit w={14} h={14} /> Sửa
                  </button>
                </>
              )}
            </div>
          </div>
          <InfoRow
            label="Di động"
            value={customer.DienThoai || customer.phone}
          />
          <div
            className={`${styles.buttonContainer} ${styles.multiButtonContainer}`}
          >
            <button
              onClick={handleOpenActionPanel}
              className={`${styles.buttonBase} ${styles.greenButton}`}
            >
              Hành động nhanh
            </button>
            <button
              onClick={() => setShowCampaignList(!showCampaignList)}
              className={`${styles.buttonBase} ${styles.greenButton}`}
            >
              Thêm vào chiến dịch
            </button>
          </div>
        </div>

        {/* === SECTION: THÔNG TIN XÉT TUYỂN === */}
        <div className={styles.section}>
          <h3 className={styles.sectionTitle}>Thông tin xét tuyển</h3>
          <InfoRow label="Tên" value={customer.name} />
          <InfoRow label="Di động" value={customer.DienThoai} />
          <InfoRow label="Mã ĐK" value={customer.MaDangKy} />
          <InfoRow label="CMND/CCCD" value={customer.CMND} />
          <InfoRow label="Ngày ĐK" value={customer.NgayDK} />
          <InfoRow label="Trường THPT" value={customer.TruongTHPT} />
          <InfoRow label="Ngành xét tuyển" value={customer.TenNganh} />
          <InfoRow label="Tổng điểm" value={customer.TongDiem} />
          <InfoRow label="Phương thức XT" value={customer.TenPhuongThuc} />
          <InfoRow
            label="Tình trạng TT"
            value={customer.TinhTrang}
            statusColor={getStatusColor(customer.TinhTrang)}
          />
          <div className={styles.buttonContainer}>
            <button
              className={`${styles.buttonBase} ${styles.ghostButton} ${styles.fullWidthButton}`}
              onClick={handleUpdateLookup}
              disabled={!customer?.MaDangKy}
            >
              <Svg_Pen w={14} h={14} /> Đi đến trang cập nhật
            </button>
          </div>
        </div>

        {/* === SECTION: THÔNG TIN CHĂM SÓC === */}
        <div className={styles.section}>
          <h3 className={styles.sectionTitle}>Thông tin chăm sóc</h3>
          <InfoRow label="Trạng thái">
            <span>{customer.status?.name || "Chưa có"}</span>
            <button
              className={styles.inlineButton}
              onClick={() => setStatusSelectorVisible(!isStatusSelectorVisible)}
            >
              <Svg_Edit w={14} h={14} /> Thay đổi
            </button>
          </InfoRow>

          {isStatusSelectorVisible && (
            <div className={styles.statusSelector}>
              <select
                value={editableStatus}
                onChange={(e) => setEditableStatus(e.target.value)}
              >
                <option value="">-- Chọn trạng thái mới --</option>
                {statuses?.map((status) => (
                  <option key={status._id} value={status._id}>
                    {status.name}
                  </option>
                ))}
              </select>
              <div className={styles.actionButtons}>
                {customer?.status && (
                  <button
                    onClick={handleDeleteStatus}
                    // Áp dụng style nút cơ bản và màu đỏ nguy hiểm
                    className={`${styles.buttonBase} ${styles.dangerButton}`}
                  >
                    Xóa trạng thái
                  </button>
                )}
                <button
                  onClick={handleUpdateStatus}
                  // Áp dụng style nút cơ bản và màu xanh lưu
                  className={`${styles.buttonBase} ${styles.blueButton}`}
                >
                  Lưu
                </button>
              </div>
            </div>
          )}

          <InfoRow label="Giai đoạn">
            <StageIndicator level={customer.stageLevel || 0} />
            <button
              className={styles.inlineButton}
              onClick={() => setNoteVisible(!isNoteVisible)}
            >
              <Svg_Notes w={14} h={14} /> Ghi chú
            </button>
          </InfoRow>

          {isNoteVisible && (
            <div className={styles.section}>
              <div className={styles.sectionTitle}>Giai đoạn & Ghi chú</div>
              <div className={styles.infoRow}>
                <StageSelector
                  currentLevel={editableStageLevel}
                  onSelect={(level) => handleSaveField("stageLevel", level)}
                />
              </div>
              <CommentSection
                customer={customer}
                user={user}
                onUpdateCustomer={onUpdateCustomer}
              />
            </div>
          )}
          <InfoRow label="NV Chăm sóc">
            {customer.auth && customer.auth.length > 0
              ? customer.auth.map((user) => user.name || user.email).join(", ")
              : "Chưa có"}
          </InfoRow>
        </div>

        {/* === SECTION: LỊCH SỬ TƯƠNG TÁC === */}
        <div className={styles.buttonContainer}>
          <button
            className={`${styles.buttonBase} ${styles.ghostButton} ${styles.fullWidthButton}`}
            onClick={() => handleShowHistory(customer)}
          >
            <Svg_History w={16} h={16} /> Hiển thị lịch sử tương tác
          </button>
        </div>
      </div>
    </div>
  );
}
