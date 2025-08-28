// ++ ADDED: Component mới để hiển thị thẻ thông tin User hoàn chỉnh
import React from "react";
import styles from "./Display.module.css"; // Dùng chung file style đã có

const UserTag = ({ user }) => {
  if (!user) return null;

  const roleStyle =
    user.role === "Admin" ? styles.roleAdmin : styles.roleEmployee;

  return (
    <div className={styles.userTagContainer}>
      <div>
        <p className={styles.mainText}>{user.name || "N/A"}</p>
        <p className={styles.subText}>{user.phone || user.email || "..."}</p>
      </div>
      <span className={`${styles.roleTag} ${roleStyle}`}>{user.role}</span>
    </div>
  );
};

export default UserTag;
