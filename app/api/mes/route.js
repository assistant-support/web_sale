import Customer from '@/models/customer.model';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// ===== CONFIGURATION =====

// --- Pancake API ---
// URL và Token để lấy dữ liệu hội thoại từ Pancake.vn
const PANCAKE_API_URL = 'https://pancake.vn/api/v1/conversations';
const PANCAKE_ACCESS_TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJuYW1lIjoiRGV...'; // rút gọn trong ví dụ
const PAGE_IDS = [
    'igo_17841465772365564', 'igo_17841459653240080', 'igo_17841432303738838',
    '140918602777989', '104088111408586', '111644183773352', '1992837824267906'
];

// --- Registration Defaults ---
const DEFAULT_SOURCE_ID = '68b5ebb3658a1123798c0ce4';
const DEFAULT_SOURCE_NAME = 'facebook_inbox';

// ===== HELPER FUNCTIONS (Không thay đổi) =====

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
    return null;
}

function extractPhones(text) {
    if (typeof text !== 'string' || !text.trim()) return [];
    const out = new Set();
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

        // 2. Xử lý tự động: quét SĐT và thao tác DB với Customer model
        const automationResults = [];
        const processedConversations = [];

        for (const conv of conversations) {
            if (!conv.unread_count || conv.unread_count === 0) {
                continue;
            }

            processedConversations.push(conv.id);
            const customerName = conv.customers?.[0]?.name || 'Khách từ Inbox';
            const textToScan = conv.snippet || '';
            const detectedPhones = new Set();

            // Ưu tiên 1: Lấy SĐT từ trường `recent_phone_numbers`
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

            if (detectedPhones.size === 0) {
                automationResults.push({
                    conversation_id: conv.id,
                    decision: 'no_phone_detected',
                    customer_name: customerName,
                    snippet: textToScan,
                });
                continue;
            }

            // Lấy SĐT đầu tiên (đã là dạng 0xxxx... nếu normalize thành công)
            const phoneToRegister = [...detectedPhones][0];

            if (!phoneToRegister) {
                automationResults.push({
                    conversation_id: conv.id,
                    decision: 'phone_normalization_failed',
                    customer_name: customerName,
                    raw_snippet: textToScan,
                });
                continue;
            }

            // --- Kiểm tra DB (Customer model) ---
            try {
                // Tìm xem đã có phone này chưa (so sánh chính xác trên trường phone)
                const existing = await Customer.findOne({ phone: phoneToRegister }).lean?.() ?? await Customer.findOne({ phone: phoneToRegister });

                if (existing) {
                    automationResults.push({
                        conversation_id: conv.id,
                        decision: 'already_exists',
                        customer_name: customerName,
                        phone_used: phoneToRegister,
                        existing_customer_id: existing._id ?? existing.id ?? null,
                    });
                    continue; // bỏ qua tạo mới
                }

                // Nếu chưa tồn tại -> tạo mới
                const newCustomerData = {
                    name: customerName,
                    phone: phoneToRegister,
                    source: DEFAULT_SOURCE_ID,
                    sourceName: DEFAULT_SOURCE_NAME,
                    // bạn có thể thêm các trường mặc định khác ở đây nếu model yêu cầu
                };

                // Sử dụng create hoặc new + save tùy model
                let created;
                if (typeof Customer.create === 'function') {
                    created = await Customer.create(newCustomerData);
                } else {
                    // fallback nếu model là class với constructor
                    created = new Customer(newCustomerData);
                    if (typeof created.save === 'function') {
                        created = await created.save();
                    }
                }

                automationResults.push({
                    conversation_id: conv.id,
                    decision: 'created',
                    customer_name: customerName,
                    phone_used: phoneToRegister,
                    created_customer_id: created._id ?? created.id ?? null,
                });

            } catch (dbErr) {
                // Lỗi khi truy vấn/ghi DB
                automationResults.push({
                    conversation_id: conv.id,
                    decision: 'db_error',
                    customer_name: customerName,
                    phone_used: phoneToRegister,
                    error: dbErr?.message || String(dbErr),
                });
            }
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
