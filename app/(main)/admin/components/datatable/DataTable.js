// ++ ADDED: Component DataTable mới, sử dụng CSS Modules
import React from "react";
import styles from "./DataTable.module.css";
import { Svg_Plus, Svg_Trash } from "@/components/(icon)/svg";

const DataTable = ({
  columns,
  data,
  onRowClick,
  onDeleteItem,
  onAddItem,
  showActions = false,
  activeRowId,
}) => {
  // Xác định các cột cho grid layout dựa trên cấu hình
  const gridTemplateColumns = columns
    .map((col) => col.width || "1fr")
    .join(" ");
  const finalGridTemplate = showActions
    ? `${gridTemplateColumns} 50px`
    : gridTemplateColumns;

  return (
    <div className={styles.tableWrapper}>
      {/* Table Header */}
      <div
        className={styles.tableHeader}
        style={{ gridTemplateColumns: finalGridTemplate }}
      >
        {columns.map(
          (
            col,
            idx, // ++ ADDED: Lấy thêm index (idx)
          ) => (
            <div key={col.accessor || idx} className={styles.headerCell}>
              {col.header}
            </div>
          ),
        )}
        {showActions && (
          <div className={`${styles.headerCell} ${styles.actionCell}`}>
            <button
              onClick={onAddItem}
              className={styles.addButton}
              aria-label="Thêm mới"
            >
              <Svg_Plus w={18} h={18} c="currentColor" />
            </button>
          </div>
        )}
      </div>

      {/* Table Body */}
      <div className={styles.tableBody}>
        {data && data.length > 0 ? (
          data.map((item) => {
            const activeRowIds = activeRowId
              ? new Set(
                  Array.isArray(activeRowId) ? activeRowId : [activeRowId],
                )
              : new Set();
            const isActive = activeRowIds.has(item._id);
            return (
              <div
                key={item._id}
                className={`${styles.tableRow} ${
                  isActive ? styles.activeRow : ""
                }`}
                style={{ gridTemplateColumns: finalGridTemplate }}
                onClick={() => onRowClick(item)}
              >
                {columns.map(
                  (
                    col,
                    idx, // ++ ADDED: Lấy thêm index (idx)
                  ) => (
                    <div
                      // ** MODIFIED: Thêm `|| idx` làm fallback
                      key={`${item._id}-${col.accessor || idx}`}
                      className={styles.cell}
                    >
                      {col.cell ? col.cell(item) : item[col.accessor]}
                    </div>
                  ),
                )}
                {showActions && (
                  // ** ADDED: Thêm key duy nhất cho action cell
                  <div
                    key={`${item._id}-actions`}
                    className={`${styles.cell} ${styles.actionCell}`}
                  >
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onDeleteItem(item._id);
                      }}
                      className={styles.deleteButton}
                      aria-label="Xóa"
                    >
                      <Svg_Trash w={16} h={16} c="currentColor" />
                    </button>
                  </div>
                )}
              </div>
            );
          })
        ) : (
          <div className={styles.noData}>
            <p>Không có dữ liệu để hiển thị.</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default DataTable;
