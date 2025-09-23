import axios from 'axios';
import PancakeChatClient from './PancakeChatClient';

// --- CONFIGURATION ---
const PANCAKE_CONFIG = {
    baseURL: 'https://pages.fm/api',
    pageAccessToken: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjI4NDQ5Nzg2MTQyMDg4MSIsInRpbWVzdGFtcCI6MTc1ODQ1MDY1Nn0.qCZ8ggM5lE3vnBbGPTvf1sfg98MolfC4YM_Cd__D22w',
    pageId: '284497861420881'
};

// --- HELPER FUNCTIONS ---
function parseMessageContent(msg) {
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

    return null; // Return null if message is empty after parsing
}

// --- SERVER ACTIONS ---
async function getMessagesAction(conversationId) {
    'use server';
    if (!conversationId) return { success: false, error: 'Conversation ID is required' };

    try {
        const response = await axios.get(`${PANCAKE_CONFIG.baseURL}/public_api/v1/pages/${PANCAKE_CONFIG.pageId}/conversations/${conversationId}/messages`, {
            params: { page_access_token: PANCAKE_CONFIG.pageAccessToken, limit: 100 }
        });

        const messages = response.data.messages || [];
        messages.sort((a, b) => new Date(a.inserted_at) - new Date(b.inserted_at));

        const processedMessages = messages.map(msg => ({
            id: msg.id,
            inserted_at: msg.inserted_at,
            senderType: msg.from.id === PANCAKE_CONFIG.pageId ? 'page' : 'customer',
            content: parseMessageContent(msg),
        })).filter(msg => msg.content !== null); // Lọc ra các tin nhắn rỗng

        return { success: true, data: processedMessages };
    } catch (error) {
        console.error('Error fetching messages action:', error.response?.data);
        return { success: false, error: 'Failed to fetch messages' };
    }
}

async function sendMessageAction(formData) {
    'use server';
    console.log(formData);
    const conversationId = formData.get('conversationId');
    const message = formData.get('message');
    if (!conversationId || !message) return { success: false, error: 'Missing required fields' };

    try {
        const requestBody = {
            action: 'reply_inbox',
            message: message.trim()
        };
        const response = await axios.post(
            `${PANCAKE_CONFIG.baseURL}/public_api/v1/pages/${PANCAKE_CONFIG.pageId}/conversations/${conversationId}/messages`,
            requestBody,
            { params: { page_access_token: PANCAKE_CONFIG.pageAccessToken } }
        );
        console.log(response);

        return { success: true, data: response.data };
    } catch (error) {
        return { success: false, error: 'Failed to send message' };
    }
}

// --- PAGE COMPONENT (SERVER) ---
export default async function PancakePage() {
    let initialConversations = [];
    let error = null;

    try {
        const response = await axios.get(`${PANCAKE_CONFIG.baseURL}/public_api/v2/pages/${PANCAKE_CONFIG.pageId}/conversations`, {
            params: { page_access_token: PANCAKE_CONFIG.pageAccessToken }
        });
        initialConversations = response.data.conversations || [];
    } catch (e) {
        error = 'Không thể tải danh sách hội thoại.';
    }

    return (
        <div className='flex h-full w-full p-2'>
            <PancakeChatClient
                initialConversations={initialConversations}
                initialError={error}
                getMessagesAction={getMessagesAction}
                sendMessageAction={sendMessageAction}
            />
        </div>
    );
}