// web_tslhu/app/(main)/admin/components/LabelSchedule/shared/StackedProgressBar.js
"use client";
import React from "react";
import styles from "./StackedProgressBar.module.css";

const StatNumber = ({ value, label }) => (
  <div className={styles.statNumber}>
    <span className={styles.value}>{value}</span>
    <span className={styles.label}>{label}</span>
  </div>
);

export default function StackedProgressBar({ success, failed, total }) {
  const completed = success + failed;
  const remaining = total - completed;

  const successPercentage = total > 0 ? (success / total) * 100 : 0;
  const failedPercentage = total > 0 ? (failed / total) * 100 : 0;

  return (
    <div className={styles.wrapper}>
      <div className={styles.statsRow}>
        <StatNumber value={success} label="Thành công" />
        <StatNumber value={failed} label="Thất bại" />
        <StatNumber value={remaining} label="Còn lại" />
        <StatNumber value={total} label="Tổng" />
      </div>
      <div className={styles.progressBarContainer}>
        <div
          className={styles.segmentSuccess}
          style={{ width: `${successPercentage}%` }}
        />
        <div
          className={styles.segmentFailed}
          style={{ width: `${failedPercentage}%` }}
        />
      </div>
      <div className={styles.percentageRow}>
        <span>{successPercentage.toFixed(1)}%</span>
        <span>{failedPercentage.toFixed(1)}%</span>
      </div>
    </div>
  );
}
