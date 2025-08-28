// app/(main)/admin/components/CampaignTable/index.js
"use client";
// ** MODIFIED: Thêm useRef vào import
import React, {
  useState,
  useEffect,
  useCallback,
  useMemo,
  useRef,
} from "react";
import { usePanels } from "@/contexts/PanelContext";
import ScheduleDetailPanel from "../Panel/ScheduleDetailPanel";
import StackedProgressBar from "../shared/StackedProgressBar";
import { getRunningJobs, getArchivedJobs } from "@/app/actions/campaignActions";
import LoadingSpinner from "../shared/LoadingSpinner";
import PaginationControls from "../shared/PaginationControls";
import DataTable from "../datatable/DataTable";
import ZaloDisplay from "../shared/ZaloDisplay";
import UserTag from "../shared/UserTag";

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

  // ++ ADDED: State và Ref cho việc tự động làm mới và highlight
  const [highlightedId, setHighlightedId] = useState(null);
  const prevJobsRef = useRef([]);
  const paginationRef = useRef(pagination);

  // ++ ADDED: Cập nhật ref mỗi khi pagination thay đổi
  useEffect(() => {
    paginationRef.current = pagination;
  }, [pagination]);

  const activeJobIds = useMemo(() => {
    return (allActivePanels || [])
      .filter((panel) => panel.id.startsWith("schedule-detail-"))
      .map((panel) => panel.id.replace("schedule-detail-", ""));
  }, [allActivePanels]);

  // ++ ADDED: Hàm lấy dữ liệu dựa trên 'mode'
  const fetchData = useCallback(
    async (page = 1, limit = 10, isInitialLoad = false) => {
      // Chỉ hiển thị loading toàn trang ở lần tải đầu tiên
      if (isInitialLoad) setIsLoading(true);

      const fetcher = mode === "running" ? getRunningJobs : getArchivedJobs;
      const result = await fetcher({ page, limit });

      if (result.success) {
        // ++ ADDED: Logic so sánh để highlight
        if (
          !isInitialLoad &&
          mode === "archived" &&
          result.data.length > 0 &&
          prevJobsRef.current.length > 0
        ) {
          const newTopJob = result.data[0];
          const oldTopJob = prevJobsRef.current[0];
          if (newTopJob._id !== oldTopJob._id) {
            setHighlightedId(newTopJob._id);
            setTimeout(() => setHighlightedId(null), 2500); // Tắt highlight sau 2.5s
          }
        }

        setJobs(result.data);
        setPagination(result.pagination);
        prevJobsRef.current = result.data; // Cập nhật danh sách cũ
      } else {
        alert(`Lỗi tải dữ liệu: ${result.error}`);
      }

      if (isInitialLoad) setIsLoading(false);
    },
    [mode],
  );

  useEffect(() => {
    fetchData(1, 10, true);
  }, [fetchData]);

  // ++ ADDED: useEffect này chỉ chạy 1 lần để thiết lập interval
  useEffect(() => {
    const intervalId = setInterval(() => {
      const { page, limit } = paginationRef.current;
      fetchData(page || 1, limit || 10, false);
    }, 10000); // 10 giây

    return () => clearInterval(intervalId);
  }, [fetchData]);

  const handleDataRefresh = useCallback(() => {
    fetchData(pagination.page, pagination.limit, false);
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
    // ++ ADDED: Cột mới để hiển thị kết quả self-healing
    {
      header: "Kết quả cuối",
      accessor: "lastExecutionResult",
      width: "1.2fr",
      cell: (item) => (
        <span
          style={{
            fontSize: "11px",
            color: "#475569",
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
          }}
          title={item.lastExecutionResult}
        >
          {item.lastExecutionResult || "Chưa có"}
        </span>
      ),
    },
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
          onRowClick={handleOpenDetail}
          activeRowId={[...activeJobIds, highlightedId].filter(Boolean)}
        />
      </div>
      <div style={{ flexShrink: 0 }}>
        {/* ** MODIFIED: Cập nhật onPageChange để không trigger full loading */}
        <PaginationControls
          pagination={pagination}
          onPageChange={(page, limit) => fetchData(page, limit, false)}
        />
      </div>
    </div>
  );
}
