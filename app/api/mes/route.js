// app/api/fb-lab/route.js
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import mongoose, { Schema } from 'mongoose';
import { NextResponse } from 'next/server';

/** =========================
 *  HẰNG SỐ (KHÔNG DÙNG ENV)
 *  ========================= */
const VERIFY_TOKEN = 'MY_SECRET_WEBHOOK_TOKEN_123';
// ⚠️ DÁN PAGE TOKEN THẬT VÀO ĐÂY NẾU MUỐN GỌI FB GRAPH/SEND API
const PAGE_ACCESS_TOKEN = 'PASTE_YOUR_PAGE_ACCESS_TOKEN_HERE';
// ⚠️ DÁN MONGODB URI THẬT VÀO ĐÂY NẾU MUỐN LƯU DB
const MONGODB_URI = 'mongodb+srv://username:password@cluster/dbname?retryWrites=true&w=majority';

// ============== MongoDB ==============
let cached = globalThis.__fb_lab_db__ || { conn: null, promise: null };
globalThis.__fb_lab_db__ = cached;

async function connectDB() {
    if (cached.conn) return cached.conn;
    if (!cached.promise) {
        console.log('[DB] Connecting MongoDB ...');
        cached.promise = mongoose.connect(MONGODB_URI, { bufferCommands: false }).then((m) => {
            console.log('[DB] Connected');
            return m;
        }).catch(err => {
            console.error('[DB] Connect error:', err?.message);
            throw err;
        });
    }
    cached.conn = await cached.promise;
    return cached.conn;
}

// Models inline cho gọn
const FbUserSchema = new Schema({
    psid: { type: String, index: true, unique: true },
    firstName: String,
    lastName: String,
    profilePic: String,
    lastSeenAt: { type: Date, default: Date.now },
}, { timestamps: true });

const FbMessageSchema = new Schema({
    senderPsid: { type: String, index: true },
    type: { type: String, enum: ['message', 'postback'], required: true },
    text: String,
    payload: String,
    timestamp: Date,
    raw: Schema.Types.Mixed,
}, { timestamps: true });

const FbUser = mongoose.models.FbUser || mongoose.model('FbUser', FbUserSchema);
const FbMessage = mongoose.models.FbMessage || mongoose.model('FbMessage', FbMessageSchema);

// ============== Helpers ==============
function isVNPhone(str = '') {
    const s = String(str).trim();
    return /^(0\d{9}|84\d{9}|\+84\d{9})$/.test(s);
}

async function getUserProfile(psid) {
    const url = new URL(`https://graph.facebook.com/v19.0/${psid}`);
    url.searchParams.set('fields', 'first_name,last_name,profile_pic');
    url.searchParams.set('access_token', PAGE_ACCESS_TOKEN);

    console.log('[FB] GET profile:', url.toString());
    const res = await fetch(url.toString(), { method: 'GET' });
    const text = await res.text();
    console.log('[FB] Profile response status:', res.status);
    console.log('[FB] Profile response body:', text);
    if (!res.ok) throw new Error(`FB profile error: ${res.status}`);
    return JSON.parse(text);
}

async function sendMessage(psid, message) {
    const url = `https://graph.facebook.com/v19.0/me/messages?access_token=${PAGE_ACCESS_TOKEN}`;
    console.log('[FB] POST send message:', url);
    console.log('[FB] Body:', JSON.stringify({ recipient: { id: psid }, message }, null, 2));
    const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recipient: { id: psid }, message }),
    });
    const text = await res.text();
    console.log('[FB] Send response status:', res.status);
    console.log('[FB] Send response body:', text);
    return { status: res.status, body: text };
}

/** =========================================
 *  GET: GỌI LÀ CHẠY – LOG CHI TIẾT QUÁ TRÌNH
 *  Query gợi ý:
 *   - psid=... (nếu muốn gọi Graph API & Send API thật)
 *   - text=... (giả lập tin nhắn khách gửi)
 *   - payload=... (giả lập postback)
 *   - save=1 (bật lưu Mongo)
 *  ========================================= */
export async function GET(req) {
    const t0 = Date.now();
    const url = new URL(req.url);
    const psid = url.searchParams.get('psid');        // ví dụ PSID thật
    const text = url.searchParams.get('text');        // ví dụ "0965xxxxxx" hoặc "thông tin cá nhân"
    const payload = url.searchParams.get('payload');  // ví dụ "GET_STARTED_PAYLOAD"
    const save = url.searchParams.get('save') === '1';

    console.log('===================== /api/fb-lab (GET) START =====================');
    console.log('[INPUT] psid   =', psid);
    console.log('[INPUT] text   =', text);
    console.log('[INPUT] payload=', payload);
    console.log('[INPUT] save   =', save);

    // Kết nối DB (tuỳ chọn theo save)
    if (save) {
        try { await connectDB(); } catch (e) { /* đã log trong connectDB */ }
    } else {
        console.log('[DB] Skip connect (save=0)');
    }

    // 1) Lấy profile nếu có psid
    let profile = null;
    if (psid && PAGE_ACCESS_TOKEN !== 'PASTE_YOUR_PAGE_ACCESS_TOKEN_HERE') {
        try {
            profile = await getUserProfile(psid);
            console.log('[STEP] Got profile:', profile);
            if (save && profile) {
                await FbUser.findOneAndUpdate(
                    { psid },
                    {
                        psid,
                        firstName: profile.first_name,
                        lastName: profile.last_name,
                        profilePic: profile.profile_pic,
                        lastSeenAt: new Date(),
                    },
                    { upsert: true, new: true }
                );
                console.log('[DB] Upsert FbUser DONE');
            }
        } catch (e) {
            console.error('[ERR] getUserProfile:', e?.message);
        }
    } else {
        console.log('[STEP] Skip getUserProfile (missing psid or PAGE_ACCESS_TOKEN placeholder)');
    }

    // 2) Giả lập handle message
    let botReply = null;
    if (text) {
        console.log('[STEP] Handle message text =', text);
        if (save) {
            await FbMessage.create({
                senderPsid: psid || 'unknown',
                type: 'message',
                text,
                timestamp: new Date(),
                raw: { demo: true },
            });
            console.log('[DB] Insert FbMessage (type=message) DONE');
        }

        if (isVNPhone(text)) {
            botReply = { text: `Chúng tôi đã nhận số điện thoại của bạn: ${text}.` };
        } else if (text.toLowerCase().includes('thông tin cá nhân')) {
            if (profile) {
                botReply = { text: `Chào ${profile.first_name}! Tên bạn là ${profile.first_name} ${profile.last_name}. Link: https://www.facebook.com/profile.php?id=${psid}` };
            } else {
                botReply = { text: 'Chào bạn! Hiện chưa lấy được thông tin cá nhân, vui lòng thử lại sau.' };
            }
        } else if (text.toLowerCase().includes('dịch vụ')) {
            botReply = { text: 'Chúng tôi có nhiều dịch vụ. Bạn quan tâm dịch vụ nào? (Ví dụ: Đặt lịch, Hỗ trợ)' };
        } else if (text.toLowerCase().includes('đặt lịch')) {
            botReply = { text: 'Tuyệt vời! Bạn muốn đặt lịch cho dịch vụ nào và thời gian nào?' };
        } else {
            botReply = { text: `Bạn đã gửi: "${text}". Chúng tôi đã nhận và sẽ sớm phản hồi. Cảm ơn bạn!` };
        }

        // Gửi tin nhắn nếu có psid & token
        if (psid && PAGE_ACCESS_TOKEN !== 'PASTE_YOUR_PAGE_ACCESS_TOKEN_HERE') {
            try {
                await sendMessage(psid, botReply);
            } catch (e) {
                console.error('[ERR] sendMessage:', e?.message);
            }
        } else {
            console.log('[STEP] Skip sendMessage (missing psid or PAGE_ACCESS_TOKEN placeholder)');
        }
    } else {
        console.log('[STEP] No "text" provided → skip message logic');
    }

    // 3) Giả lập handle postback
    if (payload) {
        console.log('[STEP] Handle postback payload =', payload);
        if (save) {
            await FbMessage.create({
                senderPsid: psid || 'unknown',
                type: 'postback',
                payload,
                timestamp: new Date(),
                raw: { demo: true },
            });
            console.log('[DB] Insert FbMessage (type=postback) DONE');
        }

        let reply = null;
        const userName = profile?.first_name || 'bạn';
        if (payload === 'GET_STARTED_PAYLOAD') {
            reply = { text: `Chào mừng ${userName} đến với page của chúng tôi! Tôi có thể giúp gì hôm nay?` };
        } else if (payload === 'VIEW_SERVICES') {
            reply = { text: 'Dịch vụ: [Dịch vụ A], [Dịch vụ B], [Dịch vụ C].' };
        }

        if (reply && psid && PAGE_ACCESS_TOKEN !== 'PASTE_YOUR_PAGE_ACCESS_TOKEN_HERE') {
            try {
                await sendMessage(psid, reply);
            } catch (e) {
                console.error('[ERR] sendMessage (postback):', e?.message);
            }
        } else if (reply) {
            console.log('[STEP] Postback reply (dry-run):', reply);
        }
    } else {
        console.log('[STEP] No "payload" provided → skip postback logic');
    }

    const dt = Date.now() - t0;
    console.log('===================== /api/fb-lab (GET) DONE in', dt, 'ms =====================');

    // Trả JSON tóm tắt (để bạn xem nhanh trên trình duyệt/Postman)
    return NextResponse.json({
        ok: true,
        tookMs: dt,
        input: { psid, text, payload, save },
        profile: profile || null,
        replyPreview: botReply || null,
        note: 'Xem chi tiết tiến trình trong console.log của server.',
    });
}
