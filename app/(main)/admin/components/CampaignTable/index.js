// app/(main)/admin/components/CampaignTable/index.js
"use client";
import React, { useState, useEffect, useCallback, useMemo } from "react";
import { usePanels } from "@/contexts/PanelContext";
import ScheduleDetailPanel from "../Panel/ScheduleDetailPanel";
import StackedProgressBar from "../shared/StackedProgressBar";
import { getRunningJobs, getArchivedJobs } from "@/app/actions/campaignActions";
import LoadingSpinner from "../shared/LoadingSpinner";
import PaginationControls from "../shared/PaginationControls";
import DataTable from "../datatable/DataTable"; // ++ ADDED: Import DataTable
import ZaloDisplay from "../shared/ZaloDisplay";
import UserTag from "../shared/UserTag"; // ++ ADDED: Import ZaloDisplay

// Component TimeCell vẫn được giữ lại để xử lý logic thời gian phức tạp
const TimeCell = ({ job, mode }) => {
  const formatDateTime = (date) =>
    new Date(date).toLocaleString("vi-VN", {
      hour: "2-digit",
      minute: "2-digit",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });

  const getDuration = (start, end) => {
    const diff = +new Date(end) - +new Date(start);
    const h = Math.floor(diff / 3_600_000);
    const m = Math.floor((diff / 60_000) % 60);
    return h > 0 ? `${h} giờ ${m} phút` : `${m} phút`;
  };

  const getTimeLeft = (until) => {
    const diff = +new Date(until) - +new Date();
    if (diff <= 0) return "Đã xong";
    const d = Math.floor(diff / (1000 * 60 * 60 * 24));
    const h = Math.floor((diff / 3_600_000) % 24);
    if (d > 0) return `~${d} ngày`;
    const m = Math.floor((diff / 60_000) % 60);
    return h > 0 ? `~${h}h ${m}m` : `~${m}m`;
  };

  const startTime = formatDateTime(job.createdAt);
  const endTime =
    mode === "running"
      ? formatDateTime(job.estimatedCompletionTime)
      : formatDateTime(job.completedAt);
  const duration =
    mode === "running"
      ? getTimeLeft(job.estimatedCompletionTime)
      : getDuration(job.createdAt, job.completedAt);

  return (
    <div>
      <p>
        {startTime} - {endTime}
      </p>
      <p style={{ fontSize: "11px", color: "#059669", fontWeight: 500 }}>
        {mode === "running" ? `Còn lại: ${duration}` : `Tổng: ${duration}`}
      </p>
    </div>
  );
};

// --- Component Chính ---
export default function CampaignTable({ mode }) {
  const { openPanel, closePanel, allActivePanels } = usePanels();
  const [jobs, setJobs] = useState([]);
  const [pagination, setPagination] = useState({});
  const [isLoading, setIsLoading] = useState(true);

  const activeJobIds = useMemo(() => {
    return (allActivePanels || [])
      .filter((panel) => panel.id.startsWith("schedule-detail-"))
      .map((panel) => panel.id.replace("schedule-detail-", ""));
  }, [allActivePanels]);

  // ++ ADDED: Hàm lấy dữ liệu dựa trên 'mode'
  const fetchData = useCallback(
    async (page = 1, limit = 10) => {
      setIsLoading(true);
      const fetcher = mode === "running" ? getRunningJobs : getArchivedJobs;
      const result = await fetcher({ page, limit });

      if (result.success) {
        setJobs(result.data);
        setPagination(result.pagination);
      } else {
        alert(`Lỗi tải dữ liệu: ${result.error}`);
      }
      setIsLoading(false);
    },
    [mode],
  );

  useEffect(() => {
    fetchData();
  }, [fetchData]);
  const handleDataRefresh = useCallback(() => {
    fetchData(pagination.page, pagination.limit);
  }, [fetchData, pagination]);

  const handleOpenDetail = useCallback(
    (job) => {
      openPanel({
        id: `schedule-detail-${job._id}`,
        title: `Chi tiết: ${job.jobName}`,
        component: ScheduleDetailPanel,
        props: {
          panelData: job,
          isArchived: mode === "archived",
          onScheduleUpdate: handleDataRefresh,
          closePanel: () => closePanel(`schedule-detail-${job._id}`),
        },
      });
    },
    [openPanel, closePanel, mode, handleDataRefresh],
  );

  // ++ ADDED: Định nghĩa cấu trúc cột cho DataTable
  const columns = [
    { header: "Tên chiến dịch", accessor: "jobName", width: "1.5fr" },
    {
      header: "Kết quả",
      accessor: "statistics",
      width: "1.5fr",
      cell: (item) => (
        <StackedProgressBar
          success={item.statistics.completed}
          failed={item.statistics.failed}
          total={item.statistics.total}
        />
      ),
    },
    {
      header: "Tài khoản",
      accessor: "zaloAccount",
      width: "1fr",
      cell: (item) => (
        <ZaloDisplay
          name={item.zaloAccount?.name}
          phone={item.zaloAccount?.phone}
          avatar={item.zaloAccount?.avt}
        />
      ),
    },
    {
      header: "Người tạo",
      accessor: "createdBy",
      width: "1fr",
      cell: (item) => <UserTag user={item.createdBy} />,
    },
    { header: "Hành động", accessor: "actionType", width: "0.7fr" },
    {
      header: "Thời gian",
      accessor: "createdAt",
      width: "1.2fr",
      cell: (item) => <TimeCell job={item} mode={mode} />,
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
          data={jobs}
          onRowDoubleClick={handleOpenDetail}
          activeRowId={activeJobIds}
          // Không có Add/Delete nên không truyền prop
        />
      </div>
      <div style={{ flexShrink: 0 }}>
        <PaginationControls pagination={pagination} onPageChange={fetchData} />
      </div>
    </div>
  );
}
