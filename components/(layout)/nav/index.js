// components/(layout)/nav/index.js
"use client";

import React, { useMemo } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import styles from "./index.module.css";
// SỬA LỖI: Đảm bảo import đầy đủ các icon được sử dụng
import {
  Svg_Student,
  Svg_Dev,
  Svg_Admin,
  Svg_Logout,
} from "@/components/(icon)/svg";
import { logoutUser } from "@/app/actions/authActions";

// Cấu hình các mục trên thanh Nav
const NAV_ITEMS = [
  {
    href: "/",
    icon: Svg_Student,
    label: "Chăm sóc",
    roles: ["Admin", "Employee"],
  },
  { href: "/dev", icon: Svg_Dev, label: "Dev", roles: ["Admin"] },
  { href: "/admin", icon: Svg_Admin, label: "Admin", roles: ["Admin"] },
];

const NavLink = ({ href, Icon, label, isActive }) => (
  <Link
    href={href}
    className={`${styles.navItem} ${isActive ? styles.active : ""}`}
  >
    <Icon w={20} h={20} c={"currentColor"} />
    <span className={styles.navLabel}>{label}</span>
  </Link>
);

export default function Nav({ user }) {
  const pathname = usePathname();

  const accessibleNavItems = useMemo(() => {
    return NAV_ITEMS.filter((item) => item.roles.includes(user?.role));
  }, [user?.role]);

  const activeIndex = useMemo(() => {
    const exactMatch = accessibleNavItems.findIndex(
      (item) => item.href === pathname,
    );
    if (exactMatch > -1) return exactMatch;

    const prefixMatch = accessibleNavItems.reduce(
      (bestMatch, item, index) => {
        if (
          pathname.startsWith(item.href) &&
          item.href.length > (bestMatch.len || 0)
        ) {
          return { index, len: item.href.length };
        }
        return bestMatch;
      },
      { index: -1, len: -1 },
    );

    return prefixMatch.index > -1 ? prefixMatch.index : 0;
  }, [pathname, accessibleNavItems]);

  return (
    <nav className={styles.navContainer}>
      <div className={styles.logoSection}>
        <p className={styles.logoText}>iTrail</p>
      </div>

      <div className={styles.menuSection}>
        <div
          className={styles.highlight}
          style={{ transform: `translateY(${activeIndex * 56}px)` }}
        />
        {accessibleNavItems.map(({ href, icon: Icon, label }) => (
          <NavLink
            key={href}
            href={href}
            Icon={Icon}
            label={label}
            isActive={accessibleNavItems[activeIndex]?.href === href}
          />
        ))}
      </div>

      <div className={styles.userSection}>
        <div className={styles.userInfo}>
          <span className={styles.userName}>{user?.name || "User"}</span>
          <span className={styles.userRole}>{user?.role || "Employee"}</span>
        </div>
        <form action={logoutUser}>
          <button
            type="submit"
            className={styles.logoutButton}
            title="Đăng xuất"
          >
            <Svg_Logout w={20} h={20} />
          </button>
        </form>
      </div>
    </nav>
  );
}
