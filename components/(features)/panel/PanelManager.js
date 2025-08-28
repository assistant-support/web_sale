"use client";

import React, { useState, useRef, useEffect } from "react";
import { usePanels } from "@/contexts/PanelContext";
import SidePanel from "./SidePanel";
import styles from "./PanelManager.module.css";

const PANEL_WIDTH = 450;
const MAX_VISIBLE_PANELS = 3;

//<-----------------Thay đổi nhỏ: Thêm hàm tiện ích để lấy title một cách an toàn----------------->
const getSafeTitle = (title) => {
  // Nếu đã là string, trả về ngay
  if (typeof title === "string") {
    return title;
  }
  // Nếu là object và có vẻ hợp lệ, thử chuyển sang string
  if (title && typeof title.toString === "function") {
    const str = title.toString();
    // Tránh hiển thị "[object Object]" vô nghĩa
    return str === "[object Object]" ? "Đang tải tiêu đề..." : str;
  }
  // Trường hợp tệ nhất, trả về một chuỗi rỗng
  return "";
};

// --- Component Nút Điều Khiển ---
const PanelControls = ({ autoCollapsed, manualCollapsed }) => {
  const { restorePanel, bringToFront, closeAllPanels } = usePanels();
  const [isListVisible, setListVisible] = useState(false);
  const containerRef = useRef(null);

  useEffect(() => {
    if (!isListVisible) return;
    const handleClickOutside = (event) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target)
      ) {
        setListVisible(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isListVisible]);

  const allCollapsed = [...autoCollapsed, ...manualCollapsed];
  const hasAnyPanels = allCollapsed.length > 0;

  if (!hasAnyPanels) return null;

  return (
    <div className={styles.controlsContainer} ref={containerRef}>
      <div className={styles.controlButton}>
        <div
          className={styles.countSection}
          onClick={() => setListVisible(!isListVisible)}
        >
          {allCollapsed.length > 0
            ? `${allCollapsed.length} panel đang ẩn`
            : "Danh sách ẩn"}
        </div>
        <div
          className={styles.closeAllIcon}
          onClick={closeAllPanels}
          title="Đóng tất cả"
        >
          &times;
        </div>
      </div>

      {isListVisible && allCollapsed.length > 0 && (
        <div className={styles.collapsedList}>
          {autoCollapsed.map((panel) => (
            <div
              key={panel.id}
              className={styles.collapsedItem}
              onClick={() => bringToFront(panel.id)}
            >
              {/* <-----------------Thay đổi nhỏ: Sử dụng hàm an toàn-----------------> */}
              {getSafeTitle(panel.title)} (tự động)
            </div>
          ))}
          {manualCollapsed.map((panel) => (
            <div
              key={panel.id}
              className={styles.collapsedItem}
              onClick={() => restorePanel(panel.id)}
            >
              {/* <-----------------Thay đổi nhỏ: Sử dụng hàm an toàn-----------------> */}
              {getSafeTitle(panel.title)}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// --- Component Quản Lý Chính ---
const PanelManager = () => {
  const { panels, collapsed, closePanel, collapsePanel } = usePanels();
  const numToCollapseAuto = Math.max(0, panels.length - MAX_VISIBLE_PANELS);
  const autoCollapsedPanels = panels.slice(0, numToCollapseAuto);
  const visiblePanels = panels.slice(numToCollapseAuto);

  return (
    <>
      <PanelControls
        autoCollapsed={autoCollapsedPanels}
        manualCollapsed={collapsed}
      />
      {visiblePanels.map((panel, index) => {
        const { id, component: PanelComponent, props, title } = panel;
        const rightOffset = (visiblePanels.length - 1 - index) * PANEL_WIDTH;
        return (
          <SidePanel
            key={id}
            onClose={() => closePanel(id)}
            onCollapse={() => collapsePanel(id)}
            title={getSafeTitle(title)}
            rightOffset={rightOffset}
          >
            <PanelComponent {...props} />
          </SidePanel>
        );
      })}
    </>
  );
};

export default PanelManager;
