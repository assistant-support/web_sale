'use server';

import axios from 'axios';
import { PANCAKE_API_BASE_URL } from '@/config/pages';

// --- HELPER FUNCTION ---
function parseMessageContent(msg, pageId) {
    if (msg.original_message) {
        return { type: 'text', content: msg.original_message };
    }

    if (msg.attachments && msg.attachments.length > 0) {
        const attachment = msg.attachments[0];
        if (attachment.type === 'photo' || attachment.type === 'sticker') {
            return { type: 'image', url: attachment.url || attachment.image_data?.url };
        }
        if (attachment.type === 'template' && attachment.payload?.template_type === 'receipt') {
            const items = attachment.payload.elements.map(el => el.title).join(', ');
            const total = new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(attachment.payload.summary.total_cost);
            return { type: 'receipt', title: `Đơn hàng #${attachment.payload.order_number}`, items, total };
        }
        if (attachment.type === 'system_message' && attachment.message) {
            return { type: 'system', content: attachment.message };
        }
    }

    if (msg.message) {
        const textContent = msg.message.replace(/<[^>]*>/g, '').trim();
        if (textContent) {
            return { type: 'text', content: textContent };
        }
    }

    return null;
}

// --- SERVER ACTIONS ---
export async function getMessagesAction(pageId, accessToken, conversationId) {
    if (!conversationId) return { success: false, error: 'Conversation ID is required' };

    try {
        const response = await axios.get(`${PANCAKE_API_BASE_URL}/public_api/v1/pages/${pageId}/conversations/${conversationId}/messages`, {
            params: { page_access_token: accessToken, limit: 100 }
        });

        const messages = response.data.messages || [];
        messages.sort((a, b) => new Date(a.inserted_at) - new Date(b.inserted_at));

        const processedMessages = messages.map(msg => ({
            id: msg.id,
            inserted_at: msg.inserted_at,
            senderType: msg.from.id === pageId ? 'page' : 'customer',
            content: parseMessageContent(msg, pageId),
        })).filter(msg => msg.content !== null);

        return { success: true, data: processedMessages };
    } catch (error) {
        console.error('Error fetching messages action:', error.response?.data);
        return { success: false, error: 'Failed to fetch messages' };
    }
}

export async function sendMessageAction(pageId, accessToken, conversationId, message) {
    if (!conversationId || !message) return { success: false, error: 'Missing required fields' };

    try {
        const requestBody = {
            action: 'reply_inbox',
            message: message.trim(),
            messaging_type: "MESSAGE_TAG",
            tag: "POST_PURCHASE_UPDATE"
        };
        const response = await axios.post(
            `${PANCAKE_API_BASE_URL}/public_api/v1/pages/${pageId}/conversations/${conversationId}/messages`,
            requestBody,
            { params: { page_access_token: accessToken } }
        );
        return { success: true, data: response.data };
    } catch (error) {
        console.error('Error sending message:', error.response?.data);
        return { success: false, error: 'Failed to send message' };
    }
}

