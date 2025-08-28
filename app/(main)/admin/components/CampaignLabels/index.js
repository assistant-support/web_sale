// ** MODIFIED: Refactor để sử dụng DataTable và CSS Modules
"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import { usePanels } from "@/contexts/PanelContext";
import {
  getLabel,
  createOrUpdateLabel,
  deleteLabel,
} from "@/app/actions/campaignActions";
import LabelEditorPanel from "../Panel/LabelEditorPanel";
import LoadingSpinner from "../shared/LoadingSpinner";
import PaginationControls from "../shared/PaginationControls";
import DataTable from "../datatable/DataTable"; // ++ ADDED: Import DataTable mới

export default function CampaignLabels() {
  const { openPanel, closePanel, allActivePanels } = usePanels();
  const [labels, setLabels] = useState([]);
  const [pagination, setPagination] = useState({});
  const [isLoading, setIsLoading] = useState(true);

  const activeLabelIds = useMemo(() => {
    return (allActivePanels || [])
      .filter((panel) => panel.id.startsWith("edit-label-"))
      .map((panel) => panel.id.replace("edit-label-", ""));
  }, [allActivePanels]);

  const fetchData = useCallback(async (page = 1, limit = 10) => {
    setIsLoading(true);
    const result = await getLabel({ page, limit });
    if (result.success) {
      setLabels(result.data);
      setPagination(result.pagination);
    } else {
      alert(`Lỗi khi tải dữ liệu: ${result.error}`);
    }
    setIsLoading(false);
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleSuccess = (savedLabel) => {
    const exists = labels.some((l) => l._id === savedLabel._id);
    if (exists) {
      setLabels((prev) =>
        prev.map((l) => (l._id === savedLabel._id ? savedLabel : l)),
      );
    } else {
      fetchData(1, pagination.limit || 10);
    }
  };

  const handleOpenEditor = (label = null) => {
    const panelId = label ? `edit-label-${label._id}` : `create-label`;
    openPanel({
      id: panelId,
      title: label ? "Chỉnh sửa Nhãn" : "Tạo Nhãn Mới",
      component: LabelEditorPanel,
      props: {
        initialData: label,
        onSave: async (data) => {
          // Logic lưu được xử lý ngay tại đây
          const result = await createOrUpdateLabel(data);
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
    if (confirm("Bạn có chắc muốn xóa nhãn này không?")) {
      const result = await deleteLabel(id);
      if (result.success) {
        fetchData(pagination.page, pagination.limit);
      } else {
        alert(`Lỗi: ${result.error}`);
      }
    }
  };

  // ++ ADDED: Định nghĩa các cột cho DataTable
  const columns = [
    {
      header: "Tên nhãn",
      accessor: "title",
      width: "1fr", // <-- Thay '30%' bằng '1fr'
    },
    {
      header: "Mô tả ngắn",
      accessor: "desc",
      width: "2fr", // <-- Thay '70%' bằng '2fr' (gấp đôi cột tên)
      cell: (item) =>
        item.desc || <span style={{ color: "#9ca3af" }}>Không có mô tả</span>,
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
          data={labels}
          onRowClick={handleOpenEditor}
          onAddItem={() => handleOpenEditor(null)}
          onDeleteItem={handleDelete}
          showActions={true}
          activeRowId={activeLabelIds} // ** MODIFIED: Truyền danh sách ID vào prop
        />
      </div>
      {/* Pagination Controls */}
      <div style={{ flexShrink: 0 }}>
        <PaginationControls pagination={pagination} onPageChange={fetchData} />
      </div>
    </div>
  );
}
