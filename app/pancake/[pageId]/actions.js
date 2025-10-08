// app/pancake/[pageId]/actions.js
'use server';

import axios from 'axios';
import { PANCAKE_API_BASE_URL } from '@/config/pages';
import { uploadBufferToDrive, viewUrlFromId } from '@/lib/drive';

// 1) Upload ảnh lên Drive và trả về { id, url }
export async function uploadImageToDriveAction(file) {
    try {
        if (!file) return { success: false, error: 'NO_FILE' };

        // Next.js Server Actions -> file là Web File
        const bytes = await file.arrayBuffer();
        const buffer = Buffer.from(bytes);

        const info = await uploadBufferToDrive({
            name: file.name || `image_${Date.now()}`,
            mime: file.type || 'image/jpeg',
            buffer,
            folderId: '12arB7c-6neVnQWj-voiU9HeZoe_aSa08'
        });

        const id = info?.id;
        if (!id) return { success: false, error: 'UPLOAD_OK_BUT_NO_ID' };
        console.log(info);
        
        return { success: true, id, url: viewUrlFromId(id) };
    } catch (e) {
        console.error('[uploadImageToDriveAction] error:', e?.message || e);
        return { success: false, error: e?.message || 'UPLOAD_FAILED' };
    }
}

// 2) Gửi ảnh vào hội thoại (content_url = link Drive)
export async function sendImageAction(pageId, accessToken, conversationId, imageId, message) {
    try {
        if (!pageId || !accessToken || !conversationId || !imageId) {
            return { success: false, error: 'missing params' };
        }

        const fd = new FormData();
        fd.append('action', 'reply_inbox');
        fd.append('content_url', `https://lh3.googleusercontent.com/d/${imageId}`);
        fd.append('send_by_platform', 'web');
        fd.append('message', message || '')
        const url =
            `${PANCAKE_API_BASE_URL}/public_api/v1/pages/${pageId}` +
            `/conversations/${conversationId}/messages?page_access_token=${accessToken}`;

        const res = await fetch(url, { method: 'POST', body: fd });
        if (!res.ok) {
            const text = await res.text().catch(() => '');
            throw new Error(text || `HTTP ${res.status}`);
        }
        return { success: true };
    } catch (e) {
        console.error('[sendImageAction] error:', e?.message || e);
        return { success: false, error: e?.message || 'SEND_IMAGE_FAILED' };
    }
}

// 3) Gửi tin nhắn text
export async function sendMessageAction(pageId, accessToken, conversationId, message) {
    try {
        const text = (message || '').trim();
        if (!pageId || !accessToken || !conversationId || !text) {
            return { success: false, error: 'missing params' };
        }

        const url =
            `${PANCAKE_API_BASE_URL}/public_api/v1/pages/${pageId}` +
            `/conversations/${conversationId}/messages`;

        const payload = {
            action: 'reply_inbox',
            message: text,
            messaging_type: 'MESSAGE_TAG',
            tag: 'POST_PURCHASE_UPDATE',
        };

        const res = await axios.post(url, payload, {
            params: { page_access_token: accessToken },
        });

        if (res.data?.success) return { success: true };
        return { success: false, error: 'Pancake API reported failure' };
    } catch (e) {
        console.error('[sendMessageAction] error:', e?.response?.data || e?.message || e);
        return { success: false, error: e?.response?.data?.message || 'Failed to send message' };
    }
}
