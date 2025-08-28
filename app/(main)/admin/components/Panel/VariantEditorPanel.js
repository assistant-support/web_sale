// web_tslhu/app/(main)/admin/components/Panel/VariantEditorPanel.js
"use client";

import React, { useState } from "react";
// ** MODIFIED: Đổi tên prop và thêm logic xử lý mới cho nhất quán
import styles from "./LabelEditorPanel.module.css"; // Tái sử dụng style
import { createOrUpdateVariant } from "@/app/actions/variantActions";

export default function VariantEditorPanel({
  initialData,
  onSave, // <-- Đổi tên prop onVariantUpdate thành onSave
  closePanel,
}) {
  const [name, setName] = useState(initialData?.name || "");
  const [description, setDescription] = useState(
    initialData?.description || "",
  );
  const [wordsString, setWordsString] = useState(
    initialData?.words?.join("\n") || "",
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    if (!name) {
      setError("Tên biến thể là bắt buộc.");
      return;
    }

    setIsSubmitting(true);
    const result = await onSave({
      id: initialData?._id,
      name,
      description,
      wordsString,
    });
    setIsSubmitting(false);

    // Panel sẽ tự đóng từ component cha sau khi onSave thành công
  };

  return (
    // ** MODIFIED: Cập nhật lại cấu trúc JSX và className cho nhất quán
    <form onSubmit={handleSubmit} className={styles.panelBody}>
      {error && <p className={styles.error}>{error}</p>}
      <div className={styles.formGroup}>
        <label htmlFor="variantName">
          Tên Biến thể (ví dụ: `ngu_khi`, `chao_hoi`)
        </label>
        <input
          id="variantName"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Không dấu, không khoảng trắng..."
          className={styles.input}
          required
        />
      </div>
      <div className={styles.formGroup}>
        <label htmlFor="variantDesc">Mô tả (không bắt buộc)</label>
        <input
          id="variantDesc"
          type="text"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Mô tả công dụng của biến thể này"
          className={styles.input}
        />
      </div>
      <div className={styles.formGroup}>
        <label htmlFor="variantWords">Danh sách từ (mỗi từ một dòng)</label>
        <textarea
          id="variantWords"
          value={wordsString}
          onChange={(e) => setWordsString(e.target.value)}
          rows="10"
          placeholder="ví dụ:&#10;nha&#10;nhé&#10;nhen&#10;ạ"
          className={styles.textarea}
        />
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
          {isSubmitting ? "Đang lưu..." : "Lưu Biến thể"}
        </button>
      </div>
    </form>
  );
}
