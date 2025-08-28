import React from "react";
import styles from "./StageIndicator.module.css";

/**
 * Component hiển thị thanh tiến trình giai đoạn
 * @param {object} props
 * @param {number} props.level - Cấp độ hiện tại (ví dụ: 1, 2, 3)
 * @param {number} props.totalStages - Tổng số giai đoạn (mặc định là 3)
 */
const StageIndicator = ({ level = 0, totalStages = 3 }) => {
  return (
    <div
      className={styles.container}
      title={`Giai đoạn ${level}/${totalStages}`}
    >
      {Array.from({ length: totalStages }).map((_, index) => {
        // Một "viên thuốc" được coi là active nếu index của nó nhỏ hơn level hiện tại
        const isActive = index < level;
        return (
          <div
            key={index}
            className={`${styles.pill} ${isActive ? styles.active : ""}`}
          />
        );
      })}
    </div>
  );
};

export default StageIndicator;
