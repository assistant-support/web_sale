// components/(features)/panel/SidePanel.js
"use client";

import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import styles from "./SidePanel.module.css";
import { Svg_Close } from "@/components/(icon)/svg";

const SidePanel = ({
  onClose,
  title,
  children,
  onCollapse,
  rightOffset = 0,
}) => {
  const [isVisible, setIsVisible] = useState(false);

  // Kích hoạt animation khi component mount
  useEffect(() => {
    const timer = setTimeout(() => setIsVisible(true), 10);
    return () => clearTimeout(timer);
  }, []);

  // Style để định vị panel và tạo hiệu ứng trượt
  const panelStyle = {
    right: isVisible ? `${rightOffset}px` : `-450px`, // 450px là max-width của panel
    zIndex: 1000,
  };

  return createPortal(
    // Component này giờ chỉ render duy nhất khung panel
    <div className={styles.panel} style={panelStyle}>
      <div className={styles.panelHeader}>
        <button
          onClick={onCollapse}
          className={styles.headerButton}
          title="Thu gọn"
        >
          —
        </button>
        <h3 className={styles.panelTitle}>{title}</h3>
        <button onClick={onClose} className={styles.closeButton}>
          <Svg_Close w={24} h={24} />
        </button>
      </div>
      <div className={styles.panelContent}>{children}</div>
    </div>,
    document.body,
  );
};

export default SidePanel;
