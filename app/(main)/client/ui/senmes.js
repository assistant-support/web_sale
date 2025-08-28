"use client";

import React, {
  memo,
  useState,
  useCallback,
  useDeferredValue,
  useEffect,
} from "react";
import { useRouter } from "next/navigation";
import styles from "./index.module.css";
import Loading from "@/components/(ui)/(loading)/loading";
import { Re_Client, Re_History, Re_History_User } from "@/data/customer";
import Noti from "@/components/(features)/(noti)/noti";

function Senmes({ data = [], labelOptions = [], label }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [selectedPhones, setSelectedPhones] = useState(new Set());
  const [labels, setLabels] = useState([]);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  // Progress tracking state
  const [progress, setProgress] = useState({
    current: 0,
    total: 0,
    currentPhone: "",
  });
  const [progressVisible, setProgressVisible] = useState(false);

  // notification state
  const [notiOpen, setNotiOpen] = useState(false);
  const [notiStatus, setNotiStatus] = useState(false);
  const [notiMes, setNotiMes] = useState("");

  useEffect(() => {
    if (open) {
      setSelectedPhones(new Set(data.map((p) => p.phone)));
    }
  }, [open, data]);

  const reset = useCallback(() => {
    setLabels([]);
    setMessage("");
  }, []);

  const close = useCallback(() => {
    if (loading) return;
    setOpen(false);
    reset();
  }, [loading, reset]);

  const handleTogglePerson = useCallback((phone) => {
    setSelectedPhones((prev) => {
      const next = new Set(prev);
      if (next.has(phone)) next.delete(phone);
      else next.add(phone);
      return next;
    });
  }, []);

  const handleAddLabel = useCallback(
    (e) => {
      const val = e.target.value;
      if (!val) return;
      setLabels((prev) => {
        if (prev.includes(val)) return prev;
        const next = [...prev, val];
        if (prev.length === 0) {
          const found = label.find((opt) => opt.title === val);
          if (found?.content) setMessage(found.content);
        }
        return next;
      });
      e.target.value = "";
    },
    [label],
  );

  const deferredMessage = useDeferredValue(message);

  const handleSend = useCallback(async () => {
    if (selectedPhones.size === 0) {
      setNotiStatus(false);
      setNotiMes("Vui lòng chọn ít nhất một người để gửi tin");
      setNotiOpen(true);
      return;
    }
    if (!deferredMessage.trim()) return;

    setLoading(true);
    setProgressVisible(true);

    const recipients = data.filter((p) => selectedPhones.has(p.phone));
    const total = recipients.length;
    const results = [];

    setProgress({ current: 0, total, currentPhone: "" });

    let okCount = 0;
    let errCount = 0;

    try {
      for (let i = 0; i < recipients.length; i++) {
        const recipient = recipients[i];
        setProgress({
          current: i + 1,
          total,
          currentPhone: recipient.phone,
        });

        // Nếu message chứa "{name}", thay bằng tên người nhận
        let textToSend = deferredMessage;
        if (deferredMessage.includes("{name}")) {
          textToSend = deferredMessage.replaceAll(
            "{name}",
            recipient.nameParent || "",
          );
        }

        try {
          const res = await fetch("/api/sendmes", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              phone: recipient.phone,
              mes: textToSend,
              labels,
            }),
          });

          const apiResult = await res.json();

          if (res.ok && apiResult.status === 2) {
            results.push({ phone: recipient.phone, status: "success" });
            okCount++;
          } else {
            results.push({
              phone: recipient.phone,
              status: "failed",
              error: apiResult.mes || "Unknown error",
            });
            errCount++;
          }
        } catch (error) {
          results.push({
            phone: recipient.phone,
            status: "failed",
            error: error.message,
          });
          errCount++;
        }

        if (i < recipients.length - 1) {
          await new Promise((resolve) => setTimeout(resolve, 100));
        }
      }

      setNotiStatus(okCount > 0);
      setNotiMes(`Đã gửi: ${okCount} thành công, ${errCount} thất bại`);
      Re_Client();
      Re_History();
      recipients.forEach((person) => {
        Re_History_User(person.phone);
      });
      if (results.length > 0) {
        try {
          await fetch("/api/hissmes", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              mes: deferredMessage,
              labels,
              results,
              source: 0,
            }),
          });
          Re_History();
        } catch (err) {
          console.error("Lưu lịch sử thất bại", err);
        }
      }
    } catch (e) {
      setNotiStatus(false);
      setNotiMes("Có lỗi khi gọi API.");
    } finally {
      setLoading(false);
      setProgressVisible(false);
      close();
      setNotiOpen(true);
    }
  }, [data, selectedPhones, labels, deferredMessage, close]);

  return (
    <>
      <button
        className="button"
        onClick={() => setOpen(true)}
        style={{
          padding: "10px 12px",
          background: "var(--main_d)",
          display: "flex",
          alignItems: "center",
          gap: 8,
          width: "max-content",
          borderRadius: 8,
          color: "#fff",
          fontSize: 14,
          fontWeight: 500,
          cursor: "pointer",
        }}
      >
        <p style={{ color: "#fff" }}>Gửi tin nhắn ({data.length})</p>
      </button>

      {open && (
        <div className={styles.overlay}>
          <div className={styles.background} onClick={close} />

          <div className={styles.wrap}>
            <div className={styles.person}>
              <div className={styles.modalHeader}>
                <p className="text_4">
                  Danh sách người gửi tin ({selectedPhones.size})
                </p>
              </div>
              <div className={styles.personListWrap}>
                {data.map((person) => (
                  <div key={person.phone} className={styles.personItem}>
                    <div className={styles.wrapchecked}>
                      <input
                        type="checkbox"
                        checked={selectedPhones.has(person.phone)}
                        onChange={() => handleTogglePerson(person.phone)}
                        className={styles.checked}
                      />
                    </div>
                    <span className="text_6" style={{ flex: 1 }}>
                      {person.nameParent}
                    </span>
                    <span className="text_6" style={{ flex: 1 }}>
                      {person.phone}
                    </span>
                  </div>
                ))}
                {selectedPhones.size === 0 && (
                  <div
                    style={{
                      background: "#fff8ce",
                      display: "flex",
                      justifyContent: "center",
                      gap: 8,
                      padding: 12,
                      borderBottom: "thin solid var(--border-color)",
                    }}
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 512 512"
                      width={16}
                      height={16}
                      fill="#e4b511"
                    >
                      <path d="M256 32c14.2 0 27.3 7.5 34.5 19.8l216 368c7.3 12.4 7.3 27.7 .2 40.1S486.3 480 472 480L40 480c-14.3 0-27.6-7.7-34.7-20.1s-7-27.8 .2-40.1l216-368C228.7 39.5 241.8 32 256 32zm0 128c-13.3 0-24 10.7-24 24l0 112c0 13.3 10.7 24 24 24s24-10.7 24-24l0-112c0-13.3-10.7-24-24-24zm32 224a32 32 0 1 0 -64 0 32 32 0 1 0 64 0z" />
                    </svg>
                    <p className="text_6">
                      Bạn cần chọn ít nhất 1 người để gửi tin
                    </p>
                  </div>
                )}
              </div>
            </div>

            <div className={styles.modal}>
              <div className={styles.modalHeader}>
                <p className="text_4">Gửi tin nhắn</p>
                <button className={styles.iconBtn} onClick={close}>
                  ✕
                </button>
              </div>

              <div className={styles.modalBody}>
                <label className="text_6" style={{ marginBottom: 8 }}>
                  Chọn nhãn (có thể chọn nhiều)
                </label>
                <select
                  className={styles.selectSingle}
                  onChange={handleAddLabel}
                  defaultValue=""
                  disabled={!labelOptions.length}
                >
                  <option value="">
                    {labelOptions.length ? "Chọn nhãn" : "Không có nhãn"}
                  </option>
                  {labelOptions.map((opt, i) => (
                    <option key={i} value={opt}>
                      {opt}
                    </option>
                  ))}
                </select>
                {labels.length > 0 && (
                  <div className={styles.selectedWrap}>
                    {labels.map((lb) => (
                      <span key={lb} className={styles.chip}>
                        {lb}
                      </span>
                    ))}
                  </div>
                )}

                <label className="text_6" style={{ margin: "8px 0" }}>
                  Nội dung tin nhắn
                </label>
                <p
                  className="text_6_400"
                  style={{ fontStyle: "italic", marginBottom: 8 }}
                >
                  Có thể dùng {"{name}"} để thay thế cho tên phụ huynh hoặc dùng{" "}
                  {"{namezalo}"} để thay thế cho tên Zalo người dùng. (vd: "Xin
                  chào {"{namezalo}"}!" kết quả trả về sẽ là "Xin chào Nguyễn
                  Văn A!")
                </p>
                <textarea
                  className={styles.textArea}
                  rows={4}
                  placeholder="Nhập nội dung..."
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                />
              </div>

              <div className={styles.modalFooter}>
                <button
                  className={styles.btnText}
                  onClick={close}
                  disabled={loading}
                >
                  Hủy
                </button>
                <button
                  className={styles.btnPrimary}
                  onClick={handleSend}
                  disabled={
                    !deferredMessage.trim() ||
                    loading ||
                    selectedPhones.size === 0
                  }
                >
                  {loading ? "Đang gửi..." : "Gửi"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {loading && (
        <div
          style={{
            width: "100%",
            height: "100%",
            position: "fixed",
            top: 0,
            left: 0,
            zIndex: 9999,
            backgroundColor: "rgba(0, 0, 0, 0.3)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <div
            style={{
              background: "#fff",
              borderRadius: 12,
              padding: 24,
              minWidth: 300,
              textAlign: "center",
              boxShadow: "0 8px 32px rgba(0, 0, 0, 0.12)",
            }}
          >
            <Loading />
            {progressVisible && (
              <div style={{ marginTop: 16 }}>
                <p className="text_6" style={{ marginBottom: 8 }}>
                  Đang gửi tin nhắn...
                </p>
                <div
                  style={{
                    background: "#f0f0f0",
                    borderRadius: 8,
                    height: 8,
                    marginBottom: 8,
                    overflow: "hidden",
                  }}
                >
                  <div
                    style={{
                      background: "var(--main_d)",
                      height: "100%",
                      width: `${(progress.current / progress.total) * 100}%`,
                      transition: "width 0.3s ease",
                    }}
                  />
                </div>
                <p className="text_7" style={{ color: "#666" }}>
                  {progress.current} / {progress.total}
                </p>
                {progress.currentPhone && (
                  <p className="text_7" style={{ color: "#999", marginTop: 4 }}>
                    Đang gửi: {progress.currentPhone}
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      <Noti
        open={notiOpen}
        onClose={() => setNotiOpen(false)}
        status={notiStatus}
        mes={notiMes}
        button={
          <button
            className={styles.button}
            onClick={() => {
              setNotiOpen(false);
              window.location.reload();
            }}
            disabled={loading}
          >
            Đóng
          </button>
        }
      />
    </>
  );
}

export default memo(Senmes);
