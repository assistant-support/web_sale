"use client";
import React, { useState, useEffect } from "react";
import styles from "./PaginationControls.module.css";

export default function PaginationControls({ pagination, onPageChange }) {
  const [pageInput, setPageInput] = useState(pagination?.page || 1);
  // ++ ADDED: State cục bộ cho input limit
  const [limitInput, setLimitInput] = useState(pagination?.limit || 10);

  useEffect(() => {
    setPageInput(pagination?.page || 1);
    // ++ ADDED: Cập nhật state cục bộ khi prop pagination thay đổi
    setLimitInput(pagination?.limit || 10);
  }, [pagination?.page, pagination?.limit]);

  const handleGoToPage = (e) => {
    if (e.key === "Enter") {
      const pageNum = parseInt(pageInput, 10);
      if (pageNum >= 1 && pageNum <= pagination.totalPages) {
        onPageChange(pageNum, pagination.limit);
      } else {
        setPageInput(pagination.page);
      }
    }
  };

  const handleLimitChange = (e) => {
    if (e.key === "Enter") {
      const newLimit = parseInt(e.target.value, 10);
      if (newLimit > 0) {
        onPageChange(1, newLimit); // Reset về trang 1 khi đổi limit
      } else {
        // ** MODIFIED: Cập nhật lại state cục bộ nếu giá trị không hợp lệ
        setLimitInput(pagination.limit);
      }
    }
  };

  const currentPage = pagination?.page || 1;
  const totalPages = pagination?.totalPages || 1;
  const totalItems = pagination?.total || 0;

  return (
    <div className={styles.pagination}>
      <div className={styles.paginationInfo}>
        <div className={styles.limitControl}>
          <label htmlFor="limitInput">Số dòng/trang:</label>
          <input
            id="limitInput"
            type="number"
            // ** MODIFIED: Chuyển sang `value` và `onChange`
            value={limitInput}
            onChange={(e) => setLimitInput(e.target.value)}
            onKeyDown={handleLimitChange}
            className={styles.pageInput}
          />
        </div>
      </div>
      <div className={styles.pageNavGroup}>
        <button
          onClick={() => onPageChange(currentPage - 1, pagination.limit)}
          className={styles.pageBtn}
          disabled={currentPage <= 1}
        >
          &laquo;
        </button>
        <span>
          Trang
          <input
            type="number"
            value={pageInput}
            onChange={(e) => setPageInput(e.target.value)}
            onKeyDown={handleGoToPage}
            className={styles.pageInput}
            disabled={totalPages <= 1}
          />
          / {totalPages}
        </span>
        <button
          onClick={() => onPageChange(currentPage + 1, pagination.limit)}
          className={styles.pageBtn}
          disabled={currentPage >= totalPages}
        >
          &raquo;
        </button>
      </div>
      <div>
        <span>(Tổng cộng {totalItems} mục)</span>
      </div>
    </div>
  );
}
