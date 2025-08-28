// app/client/ui/schedule/RecipientList.js
"use client";

import React from "react";
import styles from "./RecipientList.module.css"; // Tạo file CSS riêng cho nó

const RecipientList = ({ recipients, onToggle }) => {
  return (
    <div className={styles.container}>
      {recipients.map((customer) => (
        <div key={customer._id} className={styles.item}>
          <div className={styles.info}>
            <div className={styles.name}>
              {customer.name || "(Chưa có tên)"}
            </div>
            <div className={styles.phone}>{customer.phone}</div>
          </div>
          <button
            onClick={() => onToggle(customer)} // Gọi onToggle với toàn bộ object customer
            className={styles.removeButton}
          >
            Bỏ
          </button>
        </div>
      ))}
    </div>
  );
};

export default RecipientList;
