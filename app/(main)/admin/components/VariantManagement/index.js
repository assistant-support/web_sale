// ** MODIFIED: Refactor để sử dụng DataTable, áp dụng fix lỗi cuộn
"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react"; // ++ ADDED: useMemo
import {
  getVariants,
  deleteVariant,
  createOrUpdateVariant,
} from "@/app/actions/variantActions";
import { usePanels } from "@/contexts/PanelContext";
import VariantEditorPanel from "../Panel/VariantEditorPanel";
import LoadingSpinner from "../shared/LoadingSpinner";
import PaginationControls from "../shared/PaginationControls";
import DataTable from "../datatable/DataTable";

export default function VariantManagement() {
  const [variants, setVariants] = useState([]);
  const [pagination, setPagination] = useState({});
  const [isLoading, setIsLoading] = useState(true);
  const { openPanel, closePanel, allActivePanels } = usePanels(); // ++ ADDED: allActivePanels

  // ++ ADDED: Logic tính toán TẤT CẢ các ID đang active
  const activeVariantIds = useMemo(() => {
    return (allActivePanels || [])
      .filter((panel) => panel.id.startsWith("variant-editor-"))
      .map((panel) => panel.id.replace("variant-editor-", ""));
  }, [allActivePanels]);

  const fetchData = useCallback(async (page = 1, limit = 10) => {
    setIsLoading(true);
    const result = await getVariants({ page, limit });
    if (result.success) {
      setVariants(result.data);
      setPagination(result.pagination);
    } else {
      alert(`Lỗi: ${result.error}`);
    }
    setIsLoading(false);
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleSuccess = (savedVariant) => {
    const exists = variants.some((v) => v._id === savedVariant._id);
    if (exists) {
      setVariants((prev) =>
        prev.map((v) => (v._id === savedVariant._id ? savedVariant : v)),
      );
    } else {
      fetchData(1, pagination.limit || 10);
    }
  };

  const handleOpenPanel = (variant = null) => {
    const panelId = `variant-editor-${variant?._id || "new"}`;
    openPanel({
      id: panelId,
      title: variant ? `Chỉnh sửa: {${variant.name}}` : "Tạo Biến thể mới",
      component: VariantEditorPanel,
      props: {
        initialData: variant,
        onSave: async (data) => {
          const result = await createOrUpdateVariant(data);
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
    if (confirm("Bạn có chắc muốn xóa vĩnh viễn biến thể này không?")) {
      const result = await deleteVariant(id);
      if (result.success) {
        fetchData(pagination.page, pagination.limit);
      } else {
        alert(`Lỗi: ${result.error}`);
      }
    }
  };

  const columns = [
    {
      header: "Tên (Placeholder)",
      accessor: "name",
      width: "1fr",
      cell: (item) => (
        <span
          style={{ fontFamily: "monospace", color: "#2563eb" }}
        >{`{${item.name}}`}</span>
      ),
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
    {
      header: "Số lượng từ",
      accessor: "words",
      width: "100px",
      cell: (item) => item.words.length,
    },
  ];

  if (isLoading) {
    return <LoadingSpinner />;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      {/* ++ ADDED: Áp dụng cấu trúc layout chống lỗi cuộn */}
      <div style={{ flexGrow: 1, minHeight: 0 }}>
        <DataTable
          columns={columns}
          data={variants}
          onRowClick={handleOpenPanel}
          onAddItem={() => handleOpenPanel(null)}
          onDeleteItem={handleDelete}
          showActions={true}
          activeRowId={activeVariantIds}
        />
      </div>
      <div style={{ flexShrink: 0 }}>
        <PaginationControls pagination={pagination} onPageChange={fetchData} />
      </div>
    </div>
  );
}
