// ++ ADDED: File mới cho tab Quản lý User
"use client";

import React, {
  useState,
  useEffect,
  useCallback,
  useMemo,
  useRef,
} from "react";
import { usePanels } from "@/contexts/PanelContext";
import {
  getUsersWithDetails,
  createUser,
  deleteUser,
} from "@/app/actions/userActions";
import LoadingSpinner from "../shared/LoadingSpinner";
import PaginationControls from "../shared/PaginationControls";
import DataTable from "../datatable/DataTable";
import UserDisplay from "../shared/UserDisplay";
import CustomerDisplay from "../shared/CustomerDisplay"; // Sẽ tạo component này
import UserDetailsPanel from "../Panel/UserDetailsPanel";
import UserTag from "../shared/UserTag";

// Component con để hiển thị thời gian và khoảng thời gian tương đối
const TimeDisplay = ({ time }) => {
  if (!time) return <span>-</span>;
  const actionDate = new Date(time);
  const now = new Date();
  const diffSeconds = Math.round((now - actionDate) / 1000);
  const diffMinutes = Math.round(diffSeconds / 60);
  const diffHours = Math.round(diffMinutes / 60);
  const diffDays = Math.round(diffHours / 24);

  let relativeTime = "";
  if (diffSeconds < 60) relativeTime = `${diffSeconds} giây trước`;
  else if (diffMinutes < 60) relativeTime = `${diffMinutes} phút trước`;
  else if (diffHours < 24) relativeTime = `${diffHours} giờ trước`;
  else relativeTime = `${diffDays} ngày trước`;

  const fullDateString = actionDate.toLocaleString("vi-VN");

  return (
    <div>
      <p style={{ margin: 0, fontSize: "14px" }}>{fullDateString}</p>
      <p style={{ margin: 0, fontSize: "11px", color: "#64748b" }}>
        ({relativeTime})
      </p>
    </div>
  );
};

export default function UserManagement() {
  const { openPanel, closePanel, allActivePanels } = usePanels();
  const [users, setUsers] = useState([]);
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 10,
    total: 0,
    totalPages: 1,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [highlightedId, setHighlightedId] = useState(null);
  const prevUsersRef = useRef([]);

  // ++ ADDED: Dùng useRef để lưu trữ state phân trang cho setInterval
  const paginationRef = useRef(pagination);
  useEffect(() => {
    paginationRef.current = pagination;
  }, [pagination]);

  // ** MODIFIED: Tách hàm fetchData ra khỏi useCallback để dễ quản lý
  const fetchData = async (page, limit, isInitialLoad = false) => {
    if (isInitialLoad) setIsLoading(true);

    const result = await getUsersWithDetails({ page, limit });
    if (result.success) {
      // So sánh để tìm user mới xuất hiện ở đầu
      if (
        !isInitialLoad &&
        result.data.length > 0 &&
        prevUsersRef.current.length > 0
      ) {
        const newTopUser = result.data[0];
        const oldTopUser = prevUsersRef.current[0];
        if (newTopUser._id !== oldTopUser._id) {
          setHighlightedId(newTopUser._id);
          setTimeout(() => setHighlightedId(null), 2500);
        }
      }
      setUsers(result.data);
      setPagination({
        page,
        limit,
        total: result.totalUsers,
        totalPages: result.totalPages,
      });
      prevUsersRef.current = result.data; // Cập nhật danh sách cũ
    }
    if (isInitialLoad) setIsLoading(false);
  };

  useEffect(() => {
    fetchData(1, 10, true);
  }, []);

  // ** MODIFIED: useEffect này chỉ chạy MỘT LẦN để thiết lập interval
  useEffect(() => {
    const intervalId = setInterval(() => {
      // Luôn đọc giá trị mới nhất từ ref, tránh lỗi stale state
      const { page, limit } = paginationRef.current;
      fetchData(page, limit, false);
    }, 15000);

    // Dọn dẹp interval khi component bị unmount
    return () => clearInterval(intervalId);
  }, []);

  const activeUserIds = useMemo(() => {
    return (allActivePanels || [])
      .filter((p) => p.id.startsWith("user-details-"))
      .map((p) => p.id.replace("user-details-", ""));
  }, [allActivePanels]);

  const handleOpenUserDetails = (user = null) => {
    const panelId = `user-details-${user?._id || "new"}`;
    openPanel({
      id: panelId,
      title: user ? `Chi tiết User: ${user.name}` : "Tạo User Mới",
      component: UserDetailsPanel,
      props: {
        userId: user?._id,
        onClose: () => closePanel(panelId),
        onUpdate: () => fetchData(pagination.page, pagination.limit, false),
      },
    });
  };

  const handleDelete = async (userId) => {
    if (
      confirm(
        "Bạn có chắc chắn muốn xóa người dùng này không? Hành động này không thể hoàn tác.",
      )
    ) {
      const result = await deleteUser(userId);
      if (result.success) {
        fetchData(pagination.page, pagination.limit, false);
      } else {
        alert(`Lỗi: ${result.error}`);
      }
    }
  };

  const columns = [
    { header: "User", width: "1.5fr", cell: (item) => <UserTag user={item} /> },
    {
      header: "Hành động cuối",
      width: "1.2fr",
      cell: (item) => item.latestAction?.type || "-",
    },
    {
      header: "Khách hàng TĐ",
      width: "1.5fr",
      cell: (item) =>
        item.customer?._id ? (
          <CustomerDisplay
            name={item.customer.name}
            phone={item.customer.phone}
          />
        ) : (
          "-"
        ),
    },
    {
      header: "Thời gian",
      width: "1.5fr",
      cell: (item) => <TimeDisplay time={item.latestAction?.time} />,
    },
  ];

  if (isLoading) return <LoadingSpinner />;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <div style={{ flexGrow: 1, minHeight: 0 }}>
        <DataTable
          columns={columns}
          data={users}
          onRowClick={handleOpenUserDetails}
          activeRowId={[...activeUserIds, highlightedId].filter(Boolean)}
          showActions={true}
          onAddItem={() => handleOpenUserDetails(null)}
          onDeleteItem={handleDelete}
        />
      </div>
      <div style={{ flexShrink: 0 }}>
        <PaginationControls
          pagination={pagination}
          // ** MODIFIED: Sửa tham số cuối cùng thành `false`
          onPageChange={(page, limit) => fetchData(page, limit, false)}
        />
      </div>
    </div>
  );
}
