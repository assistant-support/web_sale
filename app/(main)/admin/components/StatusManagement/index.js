// ** MODIFIED: Refactor để sử dụng DataTable và áp dụng các bản sửa lỗi
"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react"; // ++ ADDED: useMemo
import { usePanels } from "@/contexts/PanelContext";
import {
  getStatuses,
  createOrUpdateStatus,
  deleteStatus,
} from "@/app/actions/statusActions";
import StatusEditorPanel from "../Panel/StatusEditorPanel";
import LoadingSpinner from "../shared/LoadingSpinner";
import PaginationControls from "../shared/PaginationControls";
import DataTable from "../datatable/DataTable"; // ++ ADDED

export default function StatusManagement() {
  const { openPanel, closePanel, allActivePanels } = usePanels(); // ++ ADDED: allActivePanels
  const [statuses, setStatuses] = useState([]);
  const [pagination, setPagination] = useState({});
  const [isLoading, setIsLoading] = useState(true);

  // ++ ADDED: Logic tính toán TẤT CẢ các ID đang active
  const activeStatusIds = useMemo(() => {
    return (allActivePanels || [])
      .filter((panel) => panel.id.startsWith("edit-status-"))
      .map((panel) => panel.id.replace("edit-status-", ""));
  }, [allActivePanels]);

  const fetchData = useCallback(async (page = 1, limit = 10) => {
    setIsLoading(true);
    const result = await getStatuses({ page, limit });
    if (result.success) {
      setStatuses(result.data);
      setPagination(result.pagination);
    } else {
      alert(`Lỗi khi tải dữ liệu: ${result.error}`);
    }
    setIsLoading(false);
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleSuccess = (savedStatus) => {
    const exists = statuses.some((s) => s._id === savedStatus._id);
    if (exists) {
      setStatuses((prev) =>
        prev.map((s) => (s._id === savedStatus._id ? savedStatus : s)),
      );
    } else {
      fetchData(1, pagination.limit || 10);
    }
  };

  const handleOpenEditor = (status = null) => {
    const panelId = status ? `edit-status-${status._id}` : `create-status`;
    openPanel({
      id: panelId,
      title: status ? "Chỉnh sửa Trạng thái" : "Tạo Trạng thái Mới",
      component: StatusEditorPanel,
      props: {
        initialData: status,
        onSave: async (data) => {
          const result = await createOrUpdateStatus(data);
          if (result.success) {
            handleSuccess(result.data);
            closePanel(panelId);
          } else {
            alert(`Lỗi: ${result.error}`);
          }
        },
        closePanel: () => closePanel(panelId),
      },
    });
  };

  const handleDelete = async (id) => {
    if (
      confirm(
        "Bạn có chắc muốn xóa trạng thái này? Hành động này sẽ gỡ trạng thái khỏi tất cả các khách hàng liên quan.",
      )
    ) {
      const result = await deleteStatus(id);
      if (result.success) {
        fetchData(pagination.page, pagination.limit);
      } else {
        alert(`Lỗi: ${result.error}`);
      }
    }
  };

  const columns = [
    {
      header: "Tên trạng thái",
      accessor: "name",
      width: "1fr",
    },
    {
      header: "Mô tả",
      accessor: "description",
      width: "2fr",
      cell: (item) =>
        item.description || (
          <span style={{ color: "#9ca3af" }}>Không có mô tả</span>
        ),
    },
  ];

  if (isLoading) {
    return <LoadingSpinner />;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <div style={{ flexGrow: 1, minHeight: 0 }}>
        <DataTable
          columns={columns}
          data={statuses}
          onRowDoubleClick={handleOpenEditor}
          onAddItem={() => handleOpenEditor(null)}
          onDeleteItem={handleDelete}
          showActions={true}
          activeRowId={activeStatusIds} // ** MODIFIED: Truyền danh sách ID vào prop
        />
      </div>
      <div style={{ flexShrink: 0 }}>
        <PaginationControls pagination={pagination} onPageChange={fetchData} />
      </div>
    </div>
  );
}
