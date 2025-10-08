// app/api/conversations/stream/route.js
// SSE bridge: Poll Pancake -> push ngay cho client khi có thay đổi
export const runtime = 'nodejs'; // đảm bảo long-lived connection trên VPS

const ENC = new TextEncoder();

// tiện ích gửi 1 event SSE
function sseSend(controller, event, data) {
    const payload = typeof data === 'string' ? data : JSON.stringify(data);
    controller.enqueue(ENC.encode(`event: ${event}\n`));
    controller.enqueue(ENC.encode(`data: ${payload}\n\n`));
}

// tiện ích fetch với ETag/If-Modified-Since
async function fetchConversations({ pageId, accessToken, currentCount, etag, lastModified }) {
    const url = `https://pancake.vn/api/v1/pages/${pageId}/conversations?unread_first=true&mode=NONE&tags=%22ALL%22&except_tags=[]&access_token=${accessToken}&cursor_mode=true&from_platform=web&current_count=${currentCount}`;
    const headers = {};
    if (etag) headers['If-None-Match'] = etag;
    if (lastModified) headers['If-Modified-Since'] = lastModified;

    const res = await fetch(url, { headers, cache: 'no-store' });
    // 304 = không đổi
    if (res.status === 304) {
        return { status: 304 };
    }
    const text = await res.text(); // phòng body trống
    let json = null;
    try { json = text ? JSON.parse(text) : null; } catch { /* ignore parse error */ }

    return {
        status: res.status,
        json,
        etag: res.headers.get('ETag') || res.headers.get('Etag'),
        lastModified: res.headers.get('Last-Modified') || res.headers.get('Last-modified'),
    };
}

// so sánh nhanh thay đổi nội dung (fall-back khi không có 304)
function isDifferent(a, b) {
    try {
        // chỉ so phần conversations
        const aa = JSON.stringify((a && a.conversations) || []);
        const bb = JSON.stringify((b && b.conversations) || []);
        return aa !== bb;
    } catch {
        return true;
    }
}

export async function GET(req) {
    const { searchParams } = new URL(req.url);
    const pageId = searchParams.get('pageId');
    const accessToken = searchParams.get('accessToken');
    const currentCount = Number(searchParams.get('current_count') || '40'); // mặc định 40
    const pollMs = Math.max(3000, Number(searchParams.get('interval_ms') || '8000')); // mặc định 8s

    if (!pageId || !accessToken) {
        return new Response('Missing pageId/accessToken', { status: 400 });
    }

    let etag = null;
    let lastModified = null;
    let lastJson = null;

    const stream = new ReadableStream({
        async start(controller) {
            // headers SSE
            // — Cảnh báo: trên VPS nhớ bật proxy/hạ tầng hỗ trợ giữ kết nối lâu (nginx: proxy_read_timeout ...)
            controller.enqueue(ENC.encode(': connected\n\n'));

            // gửi ping keepalive mỗi 25s để giữ connection qua proxy
            const ping = setInterval(() => {
                controller.enqueue(ENC.encode('event: ping\ndata: {}\n\n'));
            }, 25000);

            // vòng lặp polling
            let stopped = false;
            const stop = () => {
                if (!stopped) {
                    stopped = true;
                    clearInterval(ping);
                    try { controller.close(); } catch { }
                }
            };

            // hứng tín hiệu đóng kết nối từ client
            const abort = req.signal;
            if (abort) {
                abort.addEventListener('abort', () => stop(), { once: true });
            }

            // lần đầu: fetch ngay để client có dữ liệu mới nhất
            try {
                const first = await fetchConversations({ pageId, accessToken, currentCount, etag, lastModified });
                if (first.status !== 304) {
                    if (first.json) {
                        lastJson = first.json;
                        etag = first.etag || etag;
                        lastModified = first.lastModified || lastModified;
                        sseSend(controller, 'conversations', { conversations: lastJson.conversations || [] });
                    }
                }
            } catch (e) {
                sseSend(controller, 'error', { message: 'initial fetch error', detail: String(e) });
            }

            // setInterval polling
            const iv = setInterval(async () => {
                if (stopped) return;
                try {
                    const resp = await fetchConversations({ pageId, accessToken, currentCount, etag, lastModified });
                    if (resp.status === 304) {
                        // không thay đổi -> bỏ qua
                        return;
                    }
                    if (resp.json && isDifferent(lastJson, resp.json)) {
                        lastJson = resp.json;
                        etag = resp.etag || etag;
                        lastModified = resp.lastModified || lastModified;
                        sseSend(controller, 'conversations', { conversations: lastJson.conversations || [] });
                    }
                } catch (e) {
                    // gửi lỗi nhưng giữ kết nối
                    sseSend(controller, 'error', { message: 'poll error', detail: String(e) });
                }
            }, pollMs);

            // cleanup khi đóng
            const cleanup = () => {
                clearInterval(iv);
                clearInterval(ping);
                try { controller.close(); } catch { }
            };

            // phòng khi client disconnect mà abort không bắt được
            req.signal?.addEventListener('abort', () => {
                cleanup();
            }, { once: true });
        }
    });

    return new Response(stream, {
        headers: {
            'Content-Type': 'text/event-stream; charset=utf-8',
            'Cache-Control': 'no-cache, no-transform',
            'Connection': 'keep-alive',
            // CORS nếu cần nghe từ domain khác
            // 'Access-Control-Allow-Origin': '*',
        },
    });
}
