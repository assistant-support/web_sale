import { NextResponse } from "next/server";
import connectDB from "@/config/connectDB";
import Customer from "@/models/customer";
import ZaloAccount from "@/models/zalo";
import Setting from "@/models/setting";
import Form from "@/models/formclient";
import Variant from "@/models/variant"; // Thêm import model Variant
import { actionZalo, sendGP } from "@/function/drive/appscript";
import { formatMessage } from "@/app/api/(zalo)/action/route"; // Thêm import hàm formatMessage

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ===== Fixed API key =====
const EXPECTED_KEY = "AIzaSyCQYlefMrueYu1JPWKeEdSOPpSmb9Rceg8";

/* ================= Local helpers ================= */
function normalizePhone(v) {
  let t = String(v ?? "").trim();
  if (!t) return "";
  if (!t.startsWith("0")) t = "0" + t;
  return t;
}

function normalizeUid(u) {
  const s = String(u ?? "").trim();
  const digits = s.replace(/\D/g, "");
  return digits;
}

async function findNextAvailableZaloAccount() {
  const ZALO_ROTATION_KEY = "lastUsedZaloIndex";

  const allAccounts = await ZaloAccount.find({}).sort({ _id: 1 }).lean();

  if (allAccounts.length === 0) {
    console.warn("[Zalo Finder] Không có bất kỳ tài khoản Zalo nào trong hệ thống.");
    return null;
  }

  const lastIndexSetting = await Setting.findOne({ key: ZALO_ROTATION_KEY });
  let lastIndex = lastIndexSetting ? Number(lastIndexSetting.value) : -1;

  for (let i = 0; i < 3 && i < allAccounts.length; i++) {
    lastIndex++;
    const currentIndex = lastIndex % allAccounts.length;
    const selectedAccount = allAccounts[currentIndex];

    if (selectedAccount.rateLimitPerHour > 0 && selectedAccount.rateLimitPerDay > 0) {
      console.log(`[Zalo Finder] Đã tìm thấy tài khoản hợp lệ: ${selectedAccount.name} tại chỉ số ${currentIndex}`);
      await Setting.updateOne(
        { key: ZALO_ROTATION_KEY },
        { $set: { value: currentIndex } },
        { upsert: true }
      );
      return selectedAccount;
    } else {
      console.log(`[Zalo Finder] Tài khoản ${selectedAccount.name} bị chặn (rate limit = 0), thử tài khoản tiếp theo.`);
    }
  }

  console.error("[Zalo Finder] Không tìm thấy tài khoản Zalo hợp lệ sau các lần thử.");
  return null;
}


/* ================= API ================= */

export async function POST(req) {
  try {
    await connectDB();

    const selectedZalo = await findNextAvailableZaloAccount();

    if (!selectedZalo) {
      return NextResponse.json(
        { status: false, message: "Hệ thống Zalo đang quá tải hoặc tất cả tài khoản đều bị chặn. Vui lòng thử lại sau." },
        { status: 503 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const { key, rowNumber, data } = body || {};

    if (key !== EXPECTED_KEY) {
      return NextResponse.json({ status: false, message: "Invalid key" }, { status: 401 });
    }

    const phone = normalizePhone(data?.phone);
    if (!phone) {
      return NextResponse.json({ status: false, message: "Missing phone" }, { status: 400 });
    }

    const existed = await Customer.exists({ phone });
    if (existed) {
      return NextResponse.json({ status: false, message: "duplicate_phone", data: { phone } }, { status: 409 });
    }

    const doc = await Customer.create({
      name: data?.name,
      bd: data?.bd,
      email: data?.email,
      phone,
      nameparent: data?.nameparent,
      area: data?.area,
      source: data?.source,
      roles: selectedZalo.roles || [],
    });

    console.log(`[Create Customer] Đã tạo khách hàng mới: ${String(doc._id)} với SĐT: ${phone}`);

    const response = NextResponse.json({
      status: true,
      message: "created_and_processing_in_background",
      data: { id: doc._id, phone },
    });

    // ====== Chạy nền (không await) ======
    setImmediate(async () => {
      const customerId = doc._id;
      let findUidStatus = "thất bại";
      let renameStatus = "không thực hiện";
      let messageStatus = "không thực hiện"; // Đổi mặc định thành "không thực hiện"

      try {
        const findUidResponse = await actionZalo({
          phone, uid: selectedZalo.uid, actionType: "findUid",
        });

        const raw = findUidResponse?.content ?? null;
        const rawUid = raw?.data?.uid ?? null;
        const normalizedUid = normalizeUid(rawUid);

        if (findUidResponse.status === true && normalizedUid) {
          findUidStatus = "thành công";

          await ZaloAccount.updateOne(
            { _id: selectedZalo._id },
            { $inc: { rateLimitPerHour: -1, rateLimitPerDay: -1 } }
          );

          await Customer.updateOne(
            { _id: customerId },
            {
              $set: {
                zaloavt: raw?.data?.avatar || null,
                zaloname: raw?.data?.zalo_name || null,
              },
              $push: {
                uid: { zalo: selectedZalo._id, uid: normalizedUid }
              }
            }
          );

          doc.zaloname = raw?.data?.zalo_name || ""; // Cập nhật `doc` trong bộ nhớ để formatMessage sử dụng
          console.log(`[BG] Đã cập nhật UID (${normalizedUid}) cho KH: ${String(customerId)}`);

          // --- Action Tag (Đổi tên gợi nhớ) ---
          renameStatus = "thất bại";
          try {
            const form = await Form.findById(doc.source).select('name').lean();
            const srcName = form ? form.name : String(doc.source || 'Unknown');
            const newZaloName = `${doc.name}_${srcName}`;
            const renameResponse = await actionZalo({
              uid: selectedZalo.uid, uidPerson: normalizedUid, actionType: 'tag', message: newZaloName, phone: phone
            });
            if (renameResponse.status) renameStatus = "thành công";
          } catch (renameError) {
            console.error("[BG] Lỗi trong lúc đổi tên gợi nhớ:", renameError.message);
          }

          // ===== CẬP NHẬT: Action Gửi tin nhắn =====
          messageStatus = "thất bại"; // Đặt mặc định là thất bại
          try {
            const messageSetting = await Setting.findOne({ _id: '68b0c30b3c4e62132237be77' }).lean();
            if (messageSetting && messageSetting.content) {
              let template = messageSetting.content;

              // Xử lý placeholder {nameform} đặc biệt
              if (template.includes("{nameform}")) {
                const form = await Form.findById(doc.source).select('name').lean();
                const formName = form ? form.name : "";
                template = template.replace(/{nameform}/g, formName);
              }

              // Gọi hàm format message
              const finalMessageToSend = await formatMessage(template, doc, selectedZalo);

              if (finalMessageToSend) {
                const sendMessageResponse = await actionZalo({
                  uid: selectedZalo.uid,
                  uidPerson: normalizedUid,
                  actionType: "sendMessage", // Giả định actionType là 'send'
                  message: finalMessageToSend,
                  phone: phone
                });
                if (sendMessageResponse.status == true) {
                  messageStatus = "thành công";
                  console.log(`[BG] Gửi tin nhắn chào mừng thành công cho UID: ${normalizedUid}`);
                } else {
                  console.warn(`[BG] Gửi tin nhắn chào mừng thất bại:`, sendMessageResponse.message);
                }
              } else {
                messageStatus = "bỏ qua (template rỗng)";
              }
            } else {
              messageStatus = "bỏ qua (không có template)";
              console.log("[BG] Không tìm thấy template tin nhắn chào mừng. Bỏ qua.");
            }
          } catch (messageError) {
            console.error("[BG] Lỗi trong lúc gửi tin nhắn:", messageError.message);
          }

        } else {
          console.warn(`[BG] Không tìm thấy UID hợp lệ cho KH: ${String(customerId)}`);
        }
      } catch (e) {
        console.error(`[BG] Lỗi nghiêm trọng trong tiến trình nền cho KH ${customerId}:`, e.message);
      } finally {
        const finalMessage = `
Hành động xác nhận khách hàng mới: ${phone}
- Tìm uid người dùng: ${findUidStatus}
- Đổi tên gợi nhớ: ${renameStatus}
- Đã gửi tin nhắn: ${messageStatus}`.trim();

        try {
          console.log("[BG] Đang gửi thông báo tổng hợp.");
          let h = await sendGP(finalMessage);
          console.log("[BG] Gửi thông báo thành công:", h);
        } catch (gpError) {
          console.error("[BG] Gửi thông báo thất bại:", gpError.message);
        }
      }
    });

    return response;
  } catch (err) {
    console.error("API error:", err);
    return NextResponse.json({ status: false, message: err?.message || "Internal error" }, { status: 500 });
  }
}