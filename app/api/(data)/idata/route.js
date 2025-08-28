import { NextResponse } from "next/server";
import connectDB from "@/config/connectDB";
import Customer from "@/models/customer";
import ZaloAccount from "@/models/zalo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ===== Google Script endpoint =====
const SCRIPT_URL_ACTION = "https://script.google.com/macros/s/AKfycbwPdVlmyUvpr7er6W8nDIVjCxN7uDcrc7E56jXmYn4-BuT0n5zcTkqW-Rj6gxUaJBmvMw/exec";

const ml = (strings, ...values) => {
    let s;
    if (Array.isArray(strings)) s = strings.reduce((out, str, i) => out + str + (values[i] ?? ""), "");
    else s = String(strings);
    return s.replace(/\r\n?/g, "\n").replace(/^\n/, "").replace(/\n$/, "");
};

async function actionZalo({ phone, uidPerson = "", actionType, message = "", uid }) {
    let formattedPhone;
    if (phone) {
        formattedPhone = phone.toString().trim();
        if (formattedPhone.startsWith("+84")) {
            // ok
        } else if (formattedPhone.startsWith("0")) {
            formattedPhone = `+84${formattedPhone.substring(1)}`;
        } else {
            formattedPhone = `+84${formattedPhone}`;
        }
    }

    if (!uid && !actionType) {
        // Chuẩn hoá: luôn trả về status boolean
        return { status: false, message: "Cần cung cấp UID hoặc actionType để thực hiện hành động.", data: null };
    }

    try {
        const payload = {
            uid: uid,
            phone: formattedPhone,
            uidPerson: uidPerson,
            actionType: actionType,
            message: ml(message),
        };
        console.log("[actionZalo][request]", payload);

        const response = await fetch(SCRIPT_URL_ACTION, {
            method: "POST",
            headers: { "Content-Type": "text/plain;charset=utf-8" },
            body: JSON.stringify(payload),
            cache: "no-store",
        });

        if (!response.ok) {
            const txt = await response.text().catch(() => "");
            console.warn("[actionZalo][http-not-ok]", response.status, txt);
            return { status: false, message: "Lỗi gọi appscript", data: { httpStatus: response.status, raw: txt } };
        }

        const result = await response.json().catch(() => null);
        console.log("[actionZalo][raw-result]", result);

        // Bọc kết quả script vào data để bên ngoài luôn đọc status boolean
        return { status: true, message: "OK", data: result };
    } catch (error) {
        console.error("[actionZalo][exception]", String(error));
        return { status: false, message: String(error), data: null };
    }
}

// ===== Fixed API key =====
const EXPECTED_KEY = "AIzaSyCQYlefMrueYu1JPWKeEdSOPpSmb9Rceg8";

/* ================= Local helpers ================= */
function normalizePhone(v) {
    let t = String(v ?? "").trim();
    if (!t) return "";
    if (!t.startsWith("0")) t = "0" + t;
    return t;
}

// UID đích: chỉ giữ chữ số
function normalizeUid(u) {
    const s = String(u ?? "").trim();
    const digits = s.replace(/\D/g, "");
    return digits;
}

function refreshWindowsInDoc(acc) {
    const now = new Date();
    let changed = false;
    if (!acc.rateLimitHourStart || now - acc.rateLimitHourStart >= 60 * 60 * 1000) {
        acc.actionsUsedThisHour = 0;
        acc.rateLimitHourStart = now;
        changed = true;
    }
    if (!acc.rateLimitDayStart || now - acc.rateLimitDayStart >= 24 * 60 * 60 * 1000) {
        acc.actionsUsedThisDay = 0;
        acc.rateLimitDayStart = now;
        changed = true;
    }
    return changed;
}
async function persistRefreshedWindows(acc) {
    await ZaloAccount.updateOne(
        { _id: acc._id },
        {
            $set: {
                actionsUsedThisHour: acc.actionsUsedThisHour,
                actionsUsedThisDay: acc.actionsUsedThisDay,
                rateLimitHourStart: acc.rateLimitHourStart,
                rateLimitDayStart: acc.rateLimitDayStart,
            },
        }
    );
}

// Chọn & reserve 1 tài khoản Zalo theo tải + quota (atomic)
async function selectAndReserveZaloAccount() {
    const candidates = await ZaloAccount.aggregate([
        { $match: { isTokenActive: true, isLocked: false } },
        {
            $addFields: {
                hourLoad: {
                    $cond: [{ $gt: ["$rateLimitPerHour", 0] }, { $divide: ["$actionsUsedThisHour", "$rateLimitPerHour"] }, 1],
                },
                dayLoad: {
                    $cond: [{ $gt: ["$rateLimitPerDay", 0] }, { $divide: ["$actionsUsedThisDay", "$rateLimitPerDay"] }, 1],
                },
            },
        },
        { $sort: { hourLoad: 1, dayLoad: 1, updatedAt: 1, _id: 1 } },
        { $project: { _id: 1 } },
        { $limit: 20 },
    ]);

    for (const c of candidates) {
        const acc = await ZaloAccount.findById(c._id);
        if (!acc) continue;

        const changed = refreshWindowsInDoc(acc);
        if (changed) await persistRefreshedWindows(acc);

        const reserved = await ZaloAccount.findOneAndUpdate(
            {
                _id: acc._id,
                isTokenActive: true,
                isLocked: false,
                $expr: {
                    $and: [
                        { $lt: ["$actionsUsedThisHour", "$rateLimitPerHour"] },
                        { $lt: ["$actionsUsedThisDay", "$rateLimitPerDay"] },
                    ],
                },
            },
            { $inc: { actionsUsedThisHour: 1, actionsUsedThisDay: 1 }, $currentDate: { updatedAt: true } },
            { new: true }
        );
        if (reserved) return reserved;
    }
    return null;
}

// Chỉ cập nhật khi có uid hợp lệ; LƯU THÊM searcherUid
async function upsertUidEntry(customerId, zaloId, uidValue, searcherUid) {
    if (!uidValue) return;
    const updated = await Customer.updateOne(
        { _id: customerId, "uid.zaloId": zaloId },
        { $set: { "uid.$.uid": uidValue, "uid.$.searcherUid": searcherUid } }
    );

    if (updated.modifiedCount === 0) {
        await Customer.updateOne(
            { _id: customerId },
            { $push: { uid: { zaloId, uid: uidValue, searcherUid } } } // strict:false cho phép field dư
        );
    }
}

// Log cá nhân vào customer.uidLogs[]
async function appendUidLog(customerId, log) {
    try {
        await Customer.updateOne({ _id: customerId }, { $push: { uidLogs: { ...log, at: new Date() } } });
        console.info("[uid-log]", String(customerId), log?.status, log?.message || "");
    } catch (e) {
        console.error("[uid-log][write-failed]", e?.message);
    }
}

/* ================= API ================= */

export async function POST(req) {
    try {
        const body = await req.json().catch(() => ({}));
        const { key, rowNumber, data } = body || {};

        if (key !== EXPECTED_KEY) {
            return NextResponse.json({ status: false, message: "Invalid key" }, { status: 401 });
        }

        const phone = normalizePhone(data?.phone);
        if (!phone) {
            return NextResponse.json({ status: false, message: "Missing phone" }, { status: 400 });
        }

        await connectDB();

        // Chặn trùng theo phone
        const existed = await Customer.exists({ phone });
        if (existed) {
            return NextResponse.json({ status: false, message: "duplicate_phone", data: { phone } }, { status: 409 });
        }

        // Tạo customer
        const doc = await Customer.create({
            address: data?.address,
            phone,
            name: data?.name,
            email: data?.email,
            age: data?.age,
            area: data?.area,
            source: data?.source,
            sheetCreatedAt: data?.createAt,
            meta: { gsheetKey: key, gsheetRow: rowNumber },
            createdFrom: "gsheet",
        });

        console.log("[create+findUid] created customer:", String(doc._id), phone);

        // Trả về ngay; phần tìm UID chạy ngầm
        const response = NextResponse.json({
            status: true,
            message: "created_and_processing_uid_in_background",
            data: { id: doc._id, phone },
        });

        // ====== Chạy nền (không await) ======
        setImmediate(async () => {
            const customerId = doc._id;
            try {
                console.log("[bg] start findUid for customer:", String(customerId));

                // 1) Chọn & reserve tài khoản Zalo
                const zalo = await selectAndReserveZaloAccount();
                if (!zalo) {
                    console.log("[bg] no quota zalo accounts.");
                    await appendUidLog(customerId, {
                        action: "findUid",
                        status: false,
                        message: "Tạm hết quota Zalo",
                        selectedZaloId: null,
                    });
                    return;
                }
                console.log("[bg] selected zalo:", String(zalo._id), "searcherUid:", zalo.uid);

                // 2) Gọi Google Script qua actionZalo (findUid)
                const apiResponse = await actionZalo({
                    phone,
                    uidPerson: "",
                    actionType: "findUid",
                    message: "",
                    uid: zalo.uid,
                });

                console.log("[bg] actionZalo wrapped response:", apiResponse);

                // 3) Trích UID từ response (ưu tiên content.data.uid trong kết quả script gốc)
                const raw = apiResponse?.data ?? null; // result gốc từ appscript (đã bọc vào data)
                const rawUid =
                    raw?.content?.data?.uid ??
                    raw?.data?.uid ??
                    raw?.data?.data?.uid ??
                    null;

                const normalizedUid = normalizeUid(rawUid);

                if (apiResponse.status === true && normalizedUid) {
                    await upsertUidEntry(customerId, zalo._id, normalizedUid, zalo.uid);

                    await appendUidLog(customerId, {
                        action: "findUid",
                        status: true,
                        message: raw?.message || "SUCCESS",
                        selectedZaloId: zalo._id,
                        uidSaved: normalizedUid,
                        searcherUid: zalo.uid,
                        scriptResult: raw,
                    });

                    console.log("[bg] saved UID:", normalizedUid, "for customer:", String(customerId));
                } else {
                    await appendUidLog(customerId, {
                        action: "findUid",
                        status: false,
                        message: apiResponse?.message || "Không tìm thấy UID hợp lệ",
                        selectedZaloId: zalo._id,
                        scriptResult: raw,
                    });
                    console.warn("[bg] no valid UID returned for customer:", String(customerId));
                }
            } catch (e) {
                console.error("[bg] error:", e?.message);
                try {
                    await appendUidLog(customerId, {
                        action: "findUid",
                        status: false,
                        message: e?.message || "Background error",
                        selectedZaloId: null,
                    });
                } catch (logErr) {
                    console.error("[bg] appendUidLog failed:", logErr?.message);
                }
            }
        });

        return response;
    } catch (err) {
        console.error("API error:", err);
        return NextResponse.json({ status: false, message: err?.message || "Internal error" }, { status: 500 });
    }
}
