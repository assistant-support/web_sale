// app/api/messages/route.js
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const GRAPH_VERSION = 'v19.0';
const PAGE_ACCESS_TOKEN = 'EAAQhreP7u2QBPXkeSSaptdgsjE6o8h3YpLJX08QZCbTo3cl8ZCM7ZCSm1maAqITZAvrZCM5g09gEBjZBZAwgiJDl8K53vWAg2yNFcx77rl0ZCRIUG8zu7ZAEASQQDZBzIMlBbboURZCxKUuYyEYv0qIF8IegAcEZAFCqQhfixoxZB5ZAqEanZCtU7r71ZBqnZBB2BjSyOPjMc8ejbHvSp6wZDZD';

const WINDOW_SECONDS = 60;
const CONVERSATION_LIMIT = 50;
const MESSAGES_PER_CONVERSATION = 50;
const MAX_CONV_PAGES = 3;
const MAX_MSG_PAGES_PER_CONV = 3;

// Source ObjectId HỢP LỆ trong DB của bạn (ví dụ: “nhập trực tiếp tại quầy”)
const DEFAULT_SOURCE_ID = '68b5ebb3658a1123798c0ce4';
const DEFAULT_SOURCE_NAME = 'facebook_inbox';

import { addRegistrationToAction } from '@/app/actions/data.actions'; // đúng path action bạn nêu

// ===== Helpers =====
function withParams(base, params) {
    const u = new URL(base);
    Object.entries(params).forEach(([k, v]) => u.searchParams.set(k, String(v)));
    return u.toString();
}
async function fbGet(url) {
    const r = await fetch(url, { cache: 'no-store' });
    if (!r.ok) {
        const body = await r.text().catch(() => '');
        throw new Error(`Facebook API ${r.status}: ${body}`);
    }
    return r.json();
}
// "2025-09-11T10:20:30+0000" -> "+00:00"
function parseFbTimeToMs(s) {
    if (typeof s !== 'string') return NaN;
    const fixed = s.replace(/([+-]\d{2})(\d{2})$/, '$1:$2');
    return Date.parse(fixed);
}

// ——— phone utils ———
function normalizeVNPhone(digits) {
    if (!digits) return null;
    let cleaned = digits.replace(/[^\d+]/g, '');
    if (/^\+?84\d{9,10}$/.test(cleaned)) cleaned = cleaned.replace(/^\+?84/, '0');
    if (/^\d{9}$/.test(cleaned) && !cleaned.startsWith('0')) cleaned = '0' + cleaned;
    if (/^0\d{9}$/.test(cleaned)) return cleaned;
    if (/^0\d{10}$/.test(cleaned)) return cleaned; // nới lỏng
    if (/^\d{9,11}$/.test(cleaned)) return cleaned; // fallback nới lỏng
    return null;
}
function extractPhones(text) {
    if (typeof text !== 'string' || !text.trim()) return [];
    const out = new Set();
    const re = /(?:\+?84|0)?(?:[\s.\-_]?\d){8,11}/g;
    const matches = text.match(re) || [];
    for (const raw of matches) {
        const only = raw.replace(/[^\d+]/g, '');
        const digitCount = (only.match(/\d/g) || []).length;
        if (digitCount < 9 || digitCount > 11) continue;
        const n = normalizeVNPhone(only);
        if (n) out.add(n);
    }
    return [...out];
}

export async function GET() {
    try {
        const now = Date.now();
        const cutoff = now - WINDOW_SECONDS * 1000;

        // 1) Page ID
        const meUrl = withParams(`https://graph.facebook.com/${GRAPH_VERSION}/me`, {
            fields: 'id',
            access_token: PAGE_ACCESS_TOKEN
        });
        const me = await fbGet(meUrl);
        const pageId = me?.id;
        if (!pageId) throw new Error('Không lấy được Page ID từ token');

        // 2) conversations + messages
        let convUrl = withParams(`https://graph.facebook.com/${GRAPH_VERSION}/me/conversations`, {
            fields: `id,updated_time,messages.limit(${MESSAGES_PER_CONVERSATION}){id,created_time,message,from}`,
            limit: CONVERSATION_LIMIT,
            access_token: PAGE_ACCESS_TOKEN
        });

        const results = [];
        let convPages = 0;

        while (convUrl && convPages < MAX_CONV_PAGES) {
            convPages++;
            const convData = await fbGet(convUrl);
            const conversations = Array.isArray(convData?.data) ? convData.data : [];

            for (const conv of conversations) {
                const convId = conv?.id;

                const take = (arr) => {
                    for (const m of arr || []) {
                        const ts = parseFbTimeToMs(m.created_time);
                        if (!Number.isFinite(ts) || ts < cutoff) continue;
                        if (m.from?.id === pageId) continue;
                        results.push({
                            id: m.id,
                            conversation_id: convId,
                            text: m.message || '',
                            from: m.from || null,
                            created_time: m.created_time,
                            timestamp_ms: ts
                        });
                    }
                };

                take(conv?.messages?.data);

                let msgUrl = conv?.messages?.paging?.next || null;
                let msgPages = 0;
                while (msgUrl && msgPages < MAX_MSG_PAGES_PER_CONV) {
                    msgPages++;
                    const msgData = await fbGet(msgUrl);
                    take(msgData?.data);
                    msgUrl = msgData?.paging?.next || null;
                }
            }

            convUrl = convData?.paging?.next || null;
        }

        // unique + sort
        const seen = new Set();
        const unique = results.filter(m => (seen.has(m.id) ? false : (seen.add(m.id), true)));
        unique.sort((a, b) => a.timestamp_ms - b.timestamp_ms);

        // 3) Automation: gọi addRegistrationToAction(prevState, FormData)
        const automation = [];
        for (const msg of unique) {
            const phones = extractPhones(msg.text);

            if (phones.length === 0) {
                automation.push({
                    message_id: msg.id,
                    conversation_id: msg.conversation_id,
                    decision: 'no_phone_detected',
                    phones_found: []
                });
                continue;
            }

            const phone = phones[0]; // 1 tin → 1 số đầu tiên
            const fd = new FormData();
            fd.set('name', msg.from?.name || 'Facebook User');
            fd.set('phone', phone);
            // Các field phía action chấp nhận từ FormData:
            fd.set('source', DEFAULT_SOURCE_ID);      // ObjectId hợp lệ (string)
            fd.set('sourceName', DEFAULT_SOURCE_NAME); // ghi chú “facebook_inbox”
            // (optional) fd.set('address',''); fd.set('email',''); fd.set('service',''); fd.set('bd','');

            let actionResult;
            try {
                actionResult = await addRegistrationToAction({}, fd);
            } catch (e) {
                actionResult = { ok: false, message: e?.message || 'Lỗi khi gọi addRegistrationToAction.' };
            }

            automation.push({
                message_id: msg.id,
                conversation_id: msg.conversation_id,
                decision: 'register_from_inbox',
                phone_used: phone,
                fb_name: msg.from?.name || 'Facebook User',
                action_result: actionResult
            });
        }

        return new Response(JSON.stringify({
            messages: unique,
            meta: {
                window_seconds: WINDOW_SECONDS,
                conversations_scanned_pages: convPages,
                page_id: pageId
            },
            automation
        }), {
            status: 200,
            headers: { 'content-type': 'application/json; charset=utf-8' }
        });

    } catch (err) {
        return new Response(JSON.stringify({
            error: 'Internal Server Error',
            detail: err?.message || String(err)
        }), {
            status: 500,
            headers: { 'content-type': 'application/json; charset=utf-8' }
        });
    }
}
