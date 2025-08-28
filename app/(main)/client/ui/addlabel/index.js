"use client";

import React, { useCallback, useState } from "react";
import styles from "./index.module.css";
import Loading from "@/components/(ui)/(loading)/loading";
import Noti from "@/components/(features)/(noti)/noti";
import CenterPopup from "@/components/(features)/(popup)/popup_center";
import { Re_Label } from "@/data/customer";

export default function AddLabelButton() {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    title: "",
    content: "",
    desc: "",
  });
  const [showNoti, setShowNoti] = useState(false);
  const [notiStatus, setNotiStatus] = useState(false);
  const [notiMes, setNotiMes] = useState("");
  const handleChange = useCallback(
    (key) => (e) => setForm((prev) => ({ ...prev, [key]: e.target.value })),
    [],
  );

  const closeForm = useCallback(() => {
    setOpen(false);
    setForm({ title: "", content: "", desc: "" });
  }, []);

  const closeNoti = useCallback(() => setShowNoti(false), []);

  const handleSave = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      const res = await fetch("/api/label", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });

      const json = await res.json();
      const isSuccess = json.success === true;
      setNotiStatus(isSuccess);
      setNotiMes(json.message || (isSuccess ? "Thành công!" : "Thất bại!"));
      setShowNoti(true);
      if (isSuccess) {
        await Re_Label();
        closeForm();
      }
    } catch (err) {
      console.error("[LABEL_ADD]", err);
      setNotiStatus(false);
      setNotiMes("Không kết nối được máy chủ!");
      setShowNoti(true);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <button
        className={`${styles.chip} ${styles.addChip}`}
        onClick={() => setOpen(true)}
        title="Thêm nhãn mới"
      >
        + Nhãn
      </button>

      <CenterPopup open={open} onClose={closeForm} title="Thêm nhãn mới">
        <div style={{ position: "relative" }}>
          {loading && (
            <div className={styles.loadingOverlay}>
              <Loading />
            </div>
          )}
          <form className={styles.form} onSubmit={handleSave}>
            <label className={styles.group}>
              Tiêu đề
              <input
                required
                value={form.title}
                onChange={handleChange("title")}
                placeholder="Tiêu đề nhãn"
                className={styles.input}
                disabled={loading}
              />
            </label>
            <label className={styles.group}>
              Miêu tả
              <textarea
                rows={3}
                value={form.desc}
                onChange={handleChange("desc")}
                placeholder="Mô tả ngắn (tuỳ chọn)…"
                className={styles.input}
                disabled={loading}
              />
            </label>
            <label className={styles.group}>
              Nội dung
              <textarea
                rows={3}
                value={form.content}
                onChange={handleChange("content")}
                placeholder="Nội dung…"
                className={styles.input}
                disabled={loading}
              />
            </label>
            <div className={styles.actions}>
              <button
                type="button"
                className={styles.btnCancel}
                onClick={closeForm}
                disabled={loading}
              >
                Huỷ
              </button>
              <button
                type="submit"
                className={styles.btnSave}
                disabled={loading}
              >
                {loading ? "Đang lưu…" : "Lưu"}
              </button>
            </div>
          </form>
        </div>
      </CenterPopup>

      <Noti
        open={showNoti}
        onClose={closeNoti}
        status={notiStatus}
        mes={notiMes}
        button={
          <button className={styles.button} onClick={closeNoti}>
            Tắt thông báo
          </button>
        }
      />
    </>
  );
}
