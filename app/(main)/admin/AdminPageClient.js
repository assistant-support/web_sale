"use client";

import React, { useState } from "react";
import styles from "./admin.module.css";
import CampaignLabels from "./components/CampaignLabels";
import CampaignTable from "./components/CampaignTable";
import AccountManagement from "./components/Account/AccountManagement";
import AssignFromSheet from "./components/AssignFromSheet";
import VariantManagement from "./components/VariantManagement";
import StatusManagement from "./components/StatusManagement";
import UserManagement from "./components/UserManagement";
import { useSearchParams, useRouter, usePathname } from "next/navigation";

export default function AdminPageClient() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const activeTab = searchParams.get("tab") || "running";

  const handleTabChange = (tabKey) => {
    const params = new URLSearchParams(searchParams);
    params.set("tab", tabKey);
    router.push(`${pathname}?${params.toString()}`);
  };

  const menuItems = [
    { key: "labels", label: "🏷️ Nhãn & Mẫu tin" },
    { key: "variants", label: "🎨 Quản lý Biến thể" },
    { key: "statuses", label: "📊 Quản lý Trạng thái" },
    { key: "running", label: "🚀 Đang chạy" },
    { key: "archived", label: "🗂️ Lịch sử" },
    { key: "accounts", label: "👤 Quản lý Tài khoản Zalo" },
    { key: "users", label: "👥 Quản lý User" },
    { key: "assign", label: "📝 Gán từ Sheet" },
  ];

  const renderActiveComponent = () => {
    switch (activeTab) {
      case "labels":
        return <CampaignLabels />;
      case "variants":
        return <VariantManagement />;
      case "statuses":
        return <StatusManagement />;
      case "running":
        return <CampaignTable mode="running" />;
      case "archived":
        return <CampaignTable mode="archived" />;
      case "accounts":
        return <AccountManagement />;
      // ++ ADDED: Thêm case cho tab user
      case "users":
        return <UserManagement />;
      case "assign":
        return <AssignFromSheet />;
      default:
        return <CampaignTable mode="running" />;
    }
  };

  return (
    <div className={styles.adminContainer}>
      <nav className={styles.adminTabMenu}>
        {menuItems.map((item) => (
          <button
            key={item.key}
            className={`${styles.tabMenuItem} ${
              activeTab === item.key ? styles.active : ""
            }`}
            onClick={() => handleTabChange(item.key)}
          >
            {item.label}
          </button>
        ))}
      </nav>
      <main className={styles.adminContent}>{renderActiveComponent()}</main>
    </div>
  );
}
