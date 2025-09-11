// app/api/messages/route.js
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// ===== CẤU HÌNH (dùng đúng biến/mã gốc, không dùng env) =====
const GRAPH_VERSION = 'v19.0';
const PAGE_ACCESS_TOKEN = 'EAAQhreP7u2QBPXkeSSaptdgsjE6o8h3YpLJX08QZCbTo3cl8ZCM7ZCSm1maAqITZAvrZCM5g09gEBjZBZAwgiJDl8K53vWAg2yNFcx77rl0ZCRIUG8zu7ZAEASQQDZBzIMlBbboURZCxKUuYyEYv0qIF8IegAcEZAFCqQhfixoxZB5ZAqEanZCtU7r71ZBqnZBB2BjSyOPjMc8ejbHvSp6wZDZD';

const WINDOW_SECONDS = 60;                 // cửa sổ 60s gần nhất
const CONVERSATION_LIMIT = 50;             // số hội thoại mỗi trang
const MESSAGES_PER_CONVERSATION = 50;      // số message lấy cho mỗi hội thoại
const MAX_CONV_PAGES = 3;                  // tối đa 3 trang hội thoại
const MAX_MSG_PAGES_PER_CONV = 3;          // tối đa 3 trang message mỗi hội thoại

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
// FB trả "2025-09-11T10:20:30+0000" -> chuẩn hoá thành "+00:00" để Date.parse đọc được
function parseFbTimeToMs(s) {
    if (typeof s !== 'string') return NaN;
    const fixed = s.replace(/([+-]\d{2})(\d{2})$/, '$1:$2');
    return Date.parse(fixed);
}

export async function GET() {
    try {
        const now = Date.now();
        const cutoff = now - WINDOW_SECONDS * 1000;

        // 1) Lấy pageId từ token (dùng "me" vì đây là PAGE access token)
        const meUrl = withParams(`https://graph.facebook.com/${GRAPH_VERSION}/me`, {
            fields: 'id',
            access_token: PAGE_ACCESS_TOKEN
        });
        const me = await fbGet(meUrl);
        const pageId = me?.id;
        if (!pageId) throw new Error('Không lấy được Page ID từ token');

        // 2) Lấy danh sách hội thoại + messages rồi lọc theo thời gian
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
                        // chỉ lấy tin người dùng gửi (loại tin do Page gửi)
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

                // trang đầu của messages
                take(conv?.messages?.data);

                // phân trang messages trong từng hội thoại (nếu có)
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

        // unique theo id + sắp xếp tăng dần theo thời gian
        const seen = new Set();
        const unique = results.filter(m => (seen.has(m.id) ? false : (seen.add(m.id), true)));
        unique.sort((a, b) => a.timestamp_ms - b.timestamp_ms);

        return new Response(JSON.stringify({
            messages: unique,
            meta: {
                window_seconds: WINDOW_SECONDS,
                conversations_scanned_pages: convPages,
                page_id: pageId
            }
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
