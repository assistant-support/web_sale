// contexts/CampaignContext.js
"use client";
import React, { createContext, useState, useContext, useCallback } from "react";

const CampaignContext = createContext();

export const CampaignProvider = ({ children }) => {
  // State chính: một mảng chứa các chiến dịch đang lên
  const [drafts, setDrafts] = useState([]);

  // Tạo một chiến dịch nháp mới (khi Action Panel mở)
  const createDraft = useCallback((draftConfig) => {
    const newDraft = { ...draftConfig, id: `campaign-${Date.now()}` };
    setDrafts((prev) => [...prev, newDraft]);
    return newDraft.id; // Trả về ID để panel có thể tự xóa khi đóng
  }, []);

  // Xóa một chiến dịch nháp (khi Action Panel đóng)
  const removeDraft = useCallback((draftId) => {
    setDrafts((prev) => prev.filter((d) => d.id !== draftId));
  }, []);

  // Thêm người nhận vào một chiến dịch nháp
  const addRecipientToDraft = useCallback((draftId, recipient) => {
    setDrafts((prev) =>
      prev.map((draft) => {
        if (draft.id === draftId) {
          // Tránh thêm trùng
          if (draft.recipients.some((r) => r._id === recipient._id))
            return draft;
          return { ...draft, recipients: [...draft.recipients, recipient] };
        }
        return draft;
      }),
    );
  }, []);

  const value = { drafts, createDraft, removeDraft, addRecipientToDraft };

  return (
    <CampaignContext.Provider value={value}>
      {children}
    </CampaignContext.Provider>
  );
};

export const useCampaigns = () => useContext(CampaignContext);
