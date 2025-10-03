// File: actions.js (Server Actions)
// ---------------------------------
// File này chứa toàn bộ logic phía server, bao gồm việc gọi API từ Pancake
// và Facebook Graph API để lấy và gửi tin nhắn.
// Các hàm trong đây được đánh dấu 'use server' để Next.js biết rằng chúng
// chỉ được thực thi trên môi trường server.

'use server';

import axios from 'axios';
import { PANCAKE_API_BASE_URL } from '@/config/pages';

// --- HELPER FUNCTION: PARSE MESSAGE CONTENT ---
/**
 * Phân tích và định dạng nội dung tin nhắn từ dữ liệu thô của API.
 * @param {object} msg - Object tin nhắn từ Pancake API.
 * @param {string} pageId - ID của trang để xác định tin nhắn hệ thống.
 * @returns {object | null} - Object nội dung đã được định dạng hoặc null nếu không hỗ trợ.
 */
function parseMessageContent(msg, pageId) {
    // 1. Tin nhắn văn bản thông thường
    if (msg.original_message) {
        return { type: 'text', content: msg.original_message };
    }

    // 2. Tin nhắn có đính kèm (ảnh, sticker, hóa đơn,...)
    if (msg.attachments && msg.attachments.length > 0) {
        const attachment = msg.attachments[0];

        // Đính kèm là ảnh hoặc sticker
        if (attachment.type === 'photo' || attachment.type === 'sticker') {
            return { type: 'image', url: attachment.url || attachment.image_data?.url };
        }

        // Đính kèm là hóa đơn (receipt)
        if (attachment.type === 'template' && attachment.payload?.template_type === 'receipt') {
            const items = attachment.payload.elements.map(el => el.title).join(', ');
            const total = new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(attachment.payload.summary.total_cost);
            return { type: 'receipt', title: `Đơn hàng #${attachment.payload.order_number}`, items, total };
        }

        // Đính kèm là tin nhắn hệ thống (ví dụ: "Sản phẩm A đã được thêm vào giỏ hàng")
        if (attachment.type === 'system_message' && attachment.message) {
            return { type: 'system', content: attachment.message };
        }
    }

    // 3. Trường hợp tin nhắn văn bản khác (có thể chứa HTML)
    if (msg.message) {
        // Loại bỏ tag HTML để lấy nội dung text thuần
        const textContent = msg.message.replace(/<[^>]*>/g, '').trim();
        if (textContent) {
            return { type: 'text', content: textContent };
        }
    }

    // Nếu không thể phân tích, trả về null để lọc ra khỏi danh sách
    return null;
}


// --- SERVER ACTION: GET MESSAGES ---
/**
 * Lấy danh sách tin nhắn của một cuộc hội thoại.
 * @param {string} pageId - ID của trang Facebook.
 * @param {string} accessToken - Access token của trang (Pancake token).
 * @param {string} conversationId - ID của cuộc hội thoại.
 * @returns {Promise<object>} - Promise chứa object kết quả { success, data } hoặc { success, error }.
 */
export async function getMessagesAction(pageId, accessToken, conversationId) {
    if (!conversationId) return { success: false, error: 'Conversation ID is required' };

    try {
        // Gọi API của Pancake để lấy tin nhắn
        const response = await axios.get(`${PANCAKE_API_BASE_URL}/public_api/v1/pages/${pageId}/conversations/${conversationId}/messages`, {
            params: { page_access_token: accessToken, limit: 100 }
        });

        const messages = response.data.messages || [];
        // Sắp xếp tin nhắn theo thứ tự thời gian tăng dần
        messages.sort((a, b) => new Date(a.inserted_at) - new Date(b.inserted_at));

        // Xử lý và định dạng từng tin nhắn để giao diện dễ dàng hiển thị
        const processedMessages = messages.map(msg => ({
            id: msg.id,
            inserted_at: msg.inserted_at,
            senderType: msg.from.id === pageId ? 'page' : 'customer',
            content: parseMessageContent(msg, pageId),
        })).filter(msg => msg.content !== null); // Lọc bỏ những tin nhắn không thể hiển thị

        return { success: true, data: processedMessages };
    } catch (error) {
        console.error('Error fetching messages action:', error.response?.data);
        return { success: false, error: 'Failed to fetch messages' };
    }
}


// --- FACEBOOK FALLBACK HELPERS ---
/**
 * Trích xuất ID người dùng từ ID cuộc hội thoại của Pancake.
 * (Vd: "pageid_userid" -> "userid")
 */
function extractUserIdFromConversationId(conversationId) {
    const parts = conversationId.split('_');
    return parts.length >= 2 ? parts[1] : null;
}

// Cấu hình Facebook Graph API
const FACEBOOK_CONFIG = {
    accessToken: 'EAAQhreP7u2QBPpxHFeZCk3wny0CE3q8lWNkEwIfCePukZB0SNfGQ7KAM7M5YhSVu6mKFfrGtXBiXZA4KkWZCK6VCAXemtwm3MYgGN9sdzMOkGohrm2Soi1tuPnHgDO5zsVQRJRaRsKrkC0RPbDa1KFqHS77ZAh6DXL2goXoNinf3CaHMp4CtbxKjGPOwHZCtOZC1UNN',
    graphURL: 'https://graph.facebook.com/v23.0'
};

/**
 * Che một phần token để bảo mật khi ghi log.
 */
function maskToken(token) {
    if (!token || typeof token !== 'string' || token.length <= 12) return String(token);
    return `${token.slice(0, 6)}...${token.slice(-6)}`;
}

/**
 * Gửi tin nhắn trực tiếp qua Facebook Graph API (phương án dự phòng).
 */
async function sendViaFacebookGraph(conversationId, message) {
    const userId = extractUserIdFromConversationId(conversationId) || conversationId;
    if (!userId) {
        throw new Error('Could not extract user ID from conversation ID');
    }

    const pageToken = FACEBOOK_CONFIG.accessToken;
    const url = `${FACEBOOK_CONFIG.graphURL}/me/messages`;

    const payload = {
        recipient: { id: userId },
        message: { text: message },
        messaging_type: 'MESSAGE_TAG',
        tag: 'POST_PURCHASE_UPDATE'
    };
    const response = await axios.post(url, payload, { params: { access_token: pageToken } });
    return response.data;
}


// --- SERVER ACTION: SEND MESSAGE ---
/**
 * Gửi một tin nhắn và xử lý các trường hợp dự phòng.
 * @param {string} pageId - ID của trang Facebook.
 * @param {string} accessToken - Access token của trang (Pancake token).
 * @param {string} conversationId - ID của cuộc hội thoại.
 * @param {string} message - Nội dung tin nhắn cần gửi.
 * @returns {Promise<object>} - Promise chứa object kết quả { success, newMessage } hoặc { success, error }.
 */
export async function sendMessageAction(pageId, accessToken, conversationId, message) {
    if (!conversationId || !message) {
        return { success: false, error: 'Missing required fields' };
    }
    const messageToSend = message.trim();
    const pancakeApiUrl = `${PANCAKE_API_BASE_URL}/public_api/v1/pages/${pageId}/conversations/${conversationId}/messages`;
    const requestBody = {
        action: 'reply_inbox',
        message: messageToSend,
        messaging_type: "MESSAGE_TAG",
        tag: "POST_PURCHASE_UPDATE"
    };

    try {
        const response = await axios.post(pancakeApiUrl, requestBody, {
            params: { page_access_token: accessToken }
        });

        // Log data thật sự trả về từ API
        if (response.data?.e_code === 10) {
            console.warn('[PANCAKE] e_code=10 → Fallback to Facebook Graph API');
            await sendViaFacebookGraph(conversationId, messageToSend);
            return { success: true }; // Vẫn trả về success
        }

        if (response.data.success) {
            return { success: true }; // Chỉ trả về trạng thái thành công
        } else {
            return { success: false, error: "Pancake API reported failure." };
        }

    } catch (error) {
        const errorCode = error.response?.data?.e_code;
        if (errorCode === 10) {
            console.warn('[PANCAKE] e_code=10 (thrown) → Fallback to Facebook Graph API');
            try {
                await sendViaFacebookGraph(conversationId, messageToSend);
                return { success: true };
            } catch (fbError) {
                return { success: false, error: `Facebook fallback failed: ${fbError.message}` };
            }
        }
        return { success: false, error: error.response?.data?.message || 'Failed to send message' };
    }
}