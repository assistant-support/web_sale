// ** MODIFIED: Hoàn trả về sử dụng CSS Modules và logic props nhất quán
"use client";

import React, { useState } from "react";
import styles from "./LabelEditorPanel.module.css"; // Sử dụng lại CSS module đã có

export default function LabelEditorPanel({ initialData, onSave, closePanel }) {
  const isEditing = initialData && initialData._id;

  const [title, setTitle] = useState(initialData?.title || "");
  const [desc, setDesc] = useState(initialData?.desc || "");
  const [content, setContent] = useState(initialData?.content || "");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (typeof onSave === "function") {
      setIsSubmitting(true);
      await onSave({
        id: isEditing ? initialData._id : undefined,
        title,
        desc,
        content,
      });
      setIsSubmitting(false);
      // Panel sẽ được đóng từ component cha sau khi onSave thành công
    }
  };

  return (
    <form onSubmit={handleSubmit} className={styles.panelBody}>
      <div className={styles.formGroup}>
        <label htmlFor="title">Tên nhãn (Tiêu đề)</label>
        <input
          type="text"
          id="title"
          name="title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
          className={styles.input} // ++ ADDED
        />
      </div>
      <div className={styles.formGroup}>
        <label htmlFor="desc">Mô tả ngắn</label>
        <input
          type="text"
          id="desc"
          name="desc"
          value={desc}
          onChange={(e) => setDesc(e.target.value)}
          className={styles.input} // ++ ADDED
        />
      </div>
      <div className={styles.formGroup}>
        <label htmlFor="content">Nội dung chi tiết (Mẫu tin)</label>
        <textarea
          id="content"
          name="content"
          rows="10"
          value={content}
          onChange={(e) => setContent(e.target.value)}
          className={styles.textarea} // ++ ADDED
        ></textarea>
      </div>
      <div className={styles.panelFooter}>
        <button
          type="button"
          onClick={closePanel}
          className={styles.cancelButton}
          disabled={isSubmitting}
        >
          Hủy
        </button>
        <button
          type="submit"
          className={styles.saveButton}
          disabled={isSubmitting}
        >
          {isSubmitting
            ? "Đang lưu..."
            : isEditing
            ? "Lưu thay đổi"
            : "Tạo Nhãn"}
        </button>
      </div>
    </form>
  );
}
