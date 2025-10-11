import { addRegistrationToAction } from '@/app/actions/data.actions';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// ===== CONFIGURATION =====

// --- Pancake API ---
// URL và Token để lấy dữ liệu hội thoại từ Pancake.vn
const PANCAKE_API_URL = 'https://pancake.vn/api/v1/conversations';
const PANCAKE_ACCESS_TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJuYW1lIjoiRGV2IFN1cHBvcnQiLCJleHAiOjE3Njc2ODY2NzksImFwcGxpY2F0aW9uIjoxLCJ1aWQiOiIwNzUzNDE2YS01NzBlLTRmODItOWI0Ny05ZmUzNTVjOGYzMTgiLCJzZXNzaW9uX2lkIjoibGtlMTltRTUwZWx2a3VKL0FsZ0s1TjhoM0FnMC9JMUZRK29FMkRSL3R4MCIsImlhdCI6MTc1OTkxMDY3OSwiZmJfaWQiOiIxMjIxNDc0MjEzMzI2OTA1NjEiLCJsb2dpbl9zZXNzaW9uIjpudWxsLCJmYl9uYW1lIjoiRGV2IFN1cHBvcnQifQ.2GybMzOImT5DLo2dktr3PJPTWPVpefiYo7mk6cq-P0M';
const PAGE_IDS = [
    'igo_17841465772365564', 'igo_17841459653240080', 'igo_17841432303738838',
    '140918602777989', '104088111408586', '111644183773352', '1992837824267906'
];

// --- Registration Defaults ---
// Thông tin mặc định khi tạo khách hàng mới từ inbox
const DEFAULT_SOURCE_ID = '68b5ebb3658a1123798c0ce4';
const DEFAULT_SOURCE_NAME = 'facebook_inbox';


// ===== HELPER FUNCTIONS (Không thay đổi) =====

// Chuẩn hóa số điện thoại Việt Nam
function normalizeVNPhone(digits) {
    if (!digits) return null;
    let cleaned = digits.replace(/[^\d+]/g, '');

    if (/^\+?84\d{9,10}$/.test(cleaned)) {
        cleaned = cleaned.replace(/^\+?84/, '0');
    }
    if (/^\d{9}$/.test(cleaned) && !cleaned.startsWith('0')) {
        cleaned = '0' + cleaned;
    }
    if (/^0\d{9}$/.test(cleaned)) {
        return cleaned;
    }
    if (/^0\d{10}$/.test(cleaned)) {
        return cleaned;
    }
    return null; // Trả về null nếu không khớp định dạng chuẩn
}

// Trích xuất số điện thoại từ một đoạn văn bản
function extractPhones(text) {
    if (typeof text !== 'string' || !text.trim()) return [];
    const out = new Set();
    // Regex linh hoạt để bắt các SĐT có thể có dấu cách, chấm, gạch ngang
    const pattern = /(?:\+?84|0)[\s.\-_]*(?:\d[\s.\-_]*){8,10}\d/g;
    const matches = text.match(pattern) || [];

    for (const raw of matches) {
        const onlyDigits = raw.replace(/[^\d+]/g, '');
        const normalized = normalizeVNPhone(onlyDigits);
        if (normalized) out.add(normalized);
    }
    return [...out];
}

// ===== API ROUTE HANDLER =====

export async function GET() {
    try {
        // 1. Lấy dữ liệu hội thoại từ Pancake API
        const pancakeApiUrl = new URL(PANCAKE_API_URL);
        const params = new URLSearchParams({
            unread_first: true,
            mode: 'NONE',
            tags: '"ALL"',
            except_tags: '[]',
            access_token: PANCAKE_ACCESS_TOKEN,
            cursor_mode: true,
            from_platform: 'web',
        });
        PAGE_IDS.forEach(id => params.append(`pages[${id}]`, 0));
        pancakeApiUrl.search = params.toString();

        const response = await fetch(pancakeApiUrl.toString(), { cache: 'no-store' });
        if (!response.ok) {
            const errorBody = await response.text();
            throw new Error(`Pancake API Error ${response.status}: ${errorBody}`);
        }
        const conversationData = await response.json();
        const conversations = Array.isArray(conversationData?.conversations) ? conversationData.conversations : [];

        // 2. Xử lý tự động: quét SĐT và gọi Action
        const automationResults = [];
        const processedConversations = [];

        for (const conv of conversations) {
            // Chỉ xử lý những hội thoại có tin nhắn chưa đọc
            if (!conv.unread_count || conv.unread_count === 0) {
                continue;
            }

            processedConversations.push(conv.id);
            const customerName = conv.customers?.[0]?.name || 'Khách từ Inbox';
            const textToScan = conv.snippet || '';
            const detectedPhones = new Set();

            // Ưu tiên 1: Lấy SĐT từ trường `recent_phone_numbers` (chính xác nhất)
            if (Array.isArray(conv.recent_phone_numbers)) {
                conv.recent_phone_numbers.forEach(p => {
                    if (p.phone_number) {
                        const normalized = normalizeVNPhone(p.phone_number);
                        if (normalized) detectedPhones.add(normalized);
                    }
                });
            }

            // Ưu tiên 2: Quét nội dung `snippet` nếu chưa tìm thấy SĐT
            if (detectedPhones.size === 0) {
                const phonesFromSnippet = extractPhones(textToScan);
                phonesFromSnippet.forEach(phone => detectedPhones.add(phone));
            }

            // Nếu không tìm thấy SĐT trong cả hai nguồn, bỏ qua
            if (detectedPhones.size === 0) {
                automationResults.push({
                    conversation_id: conv.id,
                    decision: 'no_phone_detected',
                    customer_name: customerName,
                    snippet: textToScan,
                });
                continue;
            }

            // Lấy SĐT đầu tiên tìm được để đăng ký
            const phoneToRegister = [...detectedPhones][0];

            // Tạo FormData để gọi Server Action
            const formData = new FormData();
            formData.set('name', customerName);
            formData.set('phone', phoneToRegister);
            formData.set('source', DEFAULT_SOURCE_ID);
            formData.set('sourceName', DEFAULT_SOURCE_NAME);

            let actionResult;
            try {
                // Gọi Server Action để thêm khách hàng
                actionResult = await addRegistrationToAction({}, formData);
            } catch (e) {
                actionResult = { ok: false, message: e?.message || 'Lỗi không xác định khi gọi Server Action.' };
            }

            automationResults.push({
                conversation_id: conv.id,
                decision: 'register_attempted',
                customer_name: customerName,
                phone_used: phoneToRegister,
                action_result: actionResult,
            });
        }

        // 3. Trả về kết quả
        return new Response(JSON.stringify({
            message: "Quét tin nhắn thành công!",
            meta: {
                total_conversations_from_api: conversations.length,
                processed_unread_conversations: processedConversations.length,
            },
            automation_results: automationResults,
        }), {
            status: 200,
            headers: { 'Content-Type': 'application/json; charset=utf-8' },
        });

    } catch (err) {
        console.error("API Error in /api/messages:", err);
        return new Response(JSON.stringify({
            error: 'Internal Server Error',
            detail: err?.message || String(err),
        }), {
            status: 500,
            headers: { 'Content-Type': 'application/json; charset=utf-8' },
        });
    }
}
