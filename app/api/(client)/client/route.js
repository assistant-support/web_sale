import { NextResponse } from "next/server";
import connectDB from "@/config/connectDB";
import Customer from "@/models/customer.model";
import ZaloAccount from "@/models/zalo.model";
import Setting from "@/models/setting.model";
import Form from "@/models/formclient";
import Variant from "@/models/variant.model";
import Logs from "@/models/log.model";
import { actionZalo, sendGP } from "@/function/drive/appscript";
import { formatMessage } from "@/app/api/(zalo)/action/route";
import { revalidateData } from "@/app/actions/customer.actions";
import autoAssignForCustomer from "@/utils/autoAssign";

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
      
      await Setting.updateOne(
        { key: ZALO_ROTATION_KEY },
        { $set: { value: currentIndex } },
        { upsert: true }
      );
      return selectedAccount;
    } else {
      
    }
  }

  
  return null;
}


/* ================= API ================= */

export async function POST(req) {
  try {
    
    await connectDB();
    let selectedZalo = await findNextAvailableZaloAccount();
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
      name: data?.name, bd: data?.bd, email: data?.email, phone, nameparent: data?.nameparent, area: data?.area, source: data?.source, roles: selectedZalo.roles || [],
    });
    
    // Gán tự động theo dịch vụ (nếu có)
    try {
      
      await autoAssignForCustomer(doc._id, { serviceId: data?.service });
    } catch (e) {
      console.error('[API client/create] Auto-assign tĩnh lỗi:', e?.message || e);
    }
    revalidateData();
    const response = NextResponse.json({
      status: true, message: "created_and_processing_in_background", data: { id: doc._id, phone },
    });

    // ====== Chạy nền (không await) ======
    setImmediate(async () => {
      const customerId = doc._id;
      let findUidStatus = "thất bại", renameStatus = "không thực hiện", messageStatus = "không thực hiện";

            try {
        let findUidResponse = await actionZalo({
          phone, uid: selectedZalo.uid, actionType: "findUid",
        });

        // Lưu ID của log đầu tiên để có thể xóa nếu retry thành công
        let firstLogId = null;
        
        // --- Log cho hành động findUid (lần đầu) ---
        const firstLog = await Logs.create({
          status: {
            status: findUidResponse.status,
            message: findUidResponse.content?.error_message || findUidResponse.message,                                                                         
            data: {
              error_code: findUidResponse.content?.error_code,
              error_message: findUidResponse.content?.error_message,
            },
          },
          type: "findUid",
          createBy: '68b0af5cf58b8340827174e0',
          customer: customerId,
          zalo: selectedZalo._id,
        });
        firstLogId = firstLog._id;

        // Nếu tài khoản Zalo ngừng hoạt động, thử với tài khoản khác
        if (!findUidResponse.status && findUidResponse.message?.includes('ngừng hoạt động')) {
          
          // Tìm tài khoản Zalo khác (bỏ qua tài khoản hiện tại)
          const allAccounts = await ZaloAccount.find({ _id: { $ne: selectedZalo._id } }).sort({ _id: 1 }).lean();
          let retrySuccess = false;
          
          for (const retryZalo of allAccounts) {
            if (retryZalo.rateLimitPerHour > 0 && retryZalo.rateLimitPerDay > 0) {
              
              findUidResponse = await actionZalo({
                phone, uid: retryZalo.uid, actionType: "findUid",
              });
              
              if (findUidResponse.status === true && findUidResponse.content?.data?.uid) {
                // Retry thành công - XÓA LOG ĐẦU TIÊN (thất bại) và chỉ giữ log thành công
                if (firstLogId) {
                  await Logs.deleteOne({ _id: firstLogId });
                  }
                
                // Log retry thành công
                await Logs.create({
                  status: {
                    status: true,
                    message: `✅ Tìm thành công UID Zalo (retry với tài khoản khác)`,
                    data: {
                      error_code: findUidResponse.content?.error_code || 0,
                      error_message: findUidResponse.content?.error_message || 'Thành công',
                    },
                  },
                  type: "findUid",
                  createBy: '68b0af5cf58b8340827174e0',
                  customer: customerId,
                  zalo: retryZalo._id,
                });
                
                // Cập nhật selectedZalo
                selectedZalo = retryZalo;
                findUidStatus = "thành công (retry)";
                retrySuccess = true;
               
                break;
              } else {
                // Retry thất bại - log lại nhưng không xóa log đầu tiên
                await Logs.create({
                  status: {
                    status: false,
                    message: `Retry thất bại với tài khoản ${retryZalo.name}: ${findUidResponse.content?.error_message || findUidResponse.message}`,
                    data: {
                      error_code: findUidResponse.content?.error_code,
                      error_message: findUidResponse.content?.error_message,
                    },
                  },
                  type: "findUid",
                  createBy: '68b0af5cf58b8340827174e0',
                  customer: customerId,
                  zalo: retryZalo._id,
                });
              }
            }
          }
          
          if (!retrySuccess) {
            console.error(`[BG] ❌ Tất cả tài khoản Zalo đều không hoạt động hoặc không tìm thấy UID`);
            findUidStatus = "thất bại (tất cả tài khoản đều không hoạt động)";
          }
        }

        const raw = findUidResponse?.content ?? null;
        const rawUid = raw?.data?.uid ?? null;
        const normalizedUid = normalizeUid(rawUid);
        if (findUidResponse.status === true && normalizedUid) {
          if (findUidStatus !== "thành công (retry)") {
            findUidStatus = "thành công";
          }
          await ZaloAccount.updateOne({ _id: selectedZalo._id }, { $inc: { rateLimitPerHour: -1, rateLimitPerDay: -1 } });
          await Customer.updateOne(
            { _id: customerId },
            { $set: { zaloavt: raw?.data?.avatar || null, zaloname: raw?.data?.zalo_name || null, }, $push: { uid: { zalo: selectedZalo._id, uid: normalizedUid } } }
          );
          doc.zaloname = raw?.data?.zalo_name || "";
         
          renameStatus = "thất bại";
          try {
            const form = await Form.findById(doc.source).select('name').lean();
            const srcName = form ? form.name : String(doc.source || 'Unknown');
            const newZaloName = `${doc.name}_${srcName}`;
            const renameResponse = await actionZalo({
              uid: selectedZalo.uid, uidPerson: normalizedUid, actionType: 'tag', message: newZaloName, phone: phone
            });
            
            // --- Log cho hành động tag --- (Lưu ý: type 'tag' không có trong enum, có thể cần cập nhật model)
            await Logs.create({
              message: newZaloName,
              status: {
                status: renameResponse.status,
                message: renameResponse.content?.error_message || renameResponse.message,
                data: {
                  error_code: renameResponse.content?.error_code,
                  error_message: renameResponse.content?.error_message,
                },
              },
              type: "tag", // Dùng một type hợp lệ từ enum, ví dụ addFriend
              createBy: '68b0af5cf58b8340827174e0',
              customer: customerId,
              zalo: selectedZalo._id,
            });
            if (renameResponse.status) renameStatus = "thành công";
          } catch (renameError) {
            console.error("[BG] Lỗi trong lúc đổi tên gợi nhớ:", renameError.message);
          }

          messageStatus = "thất bại";
          try {
            const messageSetting = await Setting.findOne({ _id: '68b0c30b3c4e62132237be77' }).lean();
            if (messageSetting && messageSetting.content) {
              let template = messageSetting.content;
              if (template.includes("{nameform}")) {
                const form = await Form.findById(doc.source).select('name').lean();
                template = template.replace(/{nameform}/g, form ? form.name : "");
              }
              const finalMessageToSend = await formatMessage(template, doc, selectedZalo);
              if (finalMessageToSend) {
                const sendMessageResponse = await actionZalo({
                  uid: selectedZalo.uid, uidPerson: normalizedUid, actionType: "sendMessage", message: finalMessageToSend, phone: phone
                });
                // --- Log cho hành động sendMessage ---
                await Logs.create({
                  status: {
                    status: sendMessageResponse.status,
                    message: finalMessageToSend || 'Không có tin nhắn gửi đi',
                    data: {
                      error_code: sendMessageResponse.content?.error_code,
                      error_message: sendMessageResponse.content?.error_message,
                    },
                  },
                  type: "sendMessage",
                  createBy: '68b0af5cf58b8340827174e0',
                  customer: customerId,
                  zalo: selectedZalo._id,
                });
                if (sendMessageResponse.status == true) messageStatus = "thành công";
              } else {
                messageStatus = "bỏ qua (template rỗng)";
              }
            } else {
              messageStatus = "bỏ qua (không có template)";
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
          let h = await sendGP(finalMessage); console.log("[BG] Gửi thông báo thành công:", h);
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