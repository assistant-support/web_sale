// app/pancake/[pageId]/actions.js
'use server';

import axios from 'axios';
import { PANCAKE_API_BASE_URL } from '@/config/pages';
import { uploadBufferToDrive, viewUrlFromId, directContentUrlFromId, makeFilePublic } from '@/lib/drive';

const DEFAULT_IMAGE_FOLDER_ID = '12arB7c-6neVnQWj-voiU9HeZoe_aSa08';
const DRIVE_IMAGE_FOLDER_ID = process.env.GOOGLE_DRIVE_IMAGE_FOLDER_ID || DEFAULT_IMAGE_FOLDER_ID;

const buildDriveContentUrl = (fileId, fallbackUrl) => {
    if (fallbackUrl) return fallbackUrl;
    return directContentUrlFromId(fileId);
};

async function sendMediaToConversation({
    pageId,
    accessToken,
    conversationId,
    contentUrl,
    message = '',
    contentType,
    extraFields = {},
}) {
    try {
        if (!pageId || !accessToken || !conversationId || !contentUrl) {
            return { success: false, error: 'missing params' };
        }

        const fd = new FormData();
        fd.append('action', 'reply_inbox');
        fd.append('send_by_platform', 'web');
        fd.append('content_url', contentUrl);
        fd.append('message', typeof message === 'string' ? message : '');

        if (contentType) {
            fd.append('content_type', contentType);
        }

        Object.entries(extraFields).forEach(([key, value]) => {
            if (value !== undefined && value !== null) {
                fd.append(key, typeof value === 'string' ? value : String(value));
            }
        });

        const url =
            `https://pancake.vn/api/v1/pages/${pageId}` +
            `/conversations/${conversationId}/messages?access_token=${accessToken}`;

        let res = await fetch(url, {
            method: 'POST',
            body: fd,
            headers: {
                Accept: 'application/json',
            },
        });
        res = await res.json();

        if (res.success) {
            return {
                success: true,
                messageId: res?.data?.id || res?.id || res?.message_id || null,
            };
        }
        return { success: false, error: res?.message || 'Pancake API reported failure' };
    } catch (e) {
        console.error('[sendMediaToConversation] error:', e?.message || e);
        return { success: false, error: e?.message || 'SEND_MEDIA_FAILED' };
    }
}

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
            folderId: DRIVE_IMAGE_FOLDER_ID
        });

        const id = info?.id;
        if (!id) return { success: false, error: 'UPLOAD_OK_BUT_NO_ID' };
       

        const madePublic = await makeFilePublic(id);
        if (!madePublic) {
            console.warn('[uploadImageToDriveAction] failed to set public permission for file', id);
        }
        const contentUrl = buildDriveContentUrl(id, info?.webContentLink);

        return {
            success: true,
            id,
            url: viewUrlFromId(id),
            contentUrl,
            thumbnailUrl: info?.thumbnailLink || null,
            name: info?.name || file.name,
            mime: file.type || 'image/jpeg',
            size: file.size
        };
    } catch (e) {
        console.error('[uploadImageToDriveAction] error:', e?.message || e);
        return { success: false, error: e?.message || 'UPLOAD_FAILED' };
    }
}

// 1b) Upload video lên Drive và trả về { id, url }
export async function uploadVideoToPancakeAction(file, { pageId, accessToken } = {}) {
    try {
        if (!file) return { success: false, error: 'NO_FILE' };
        if (!pageId || !accessToken) {
            return { success: false, error: 'MISSING_PAGE_CREDENTIALS' };
        }

        const bytes = await file.arrayBuffer();
        const blob = new Blob([bytes], { type: file.type || 'video/mp4' });
        const form = new FormData();
        form.append('file', blob, file.name || `video_${Date.now()}.mp4`);

        const uploadUrl = `https://pancake.vn/api/v1/pages/${pageId}/contents?access_token=${accessToken}`;

        const response = await fetch(uploadUrl, {
            method: 'POST',
            body: form,
            headers: {
                Accept: 'application/json',
            },
        });

        if (!response.ok) {
            const text = await response.text().catch(() => '');
            return { success: false, error: text || 'UPLOAD_FAILED' };
        }

        const data = await response.json().catch(() => null);

        if (!data?.content_id || !data?.id || !data?.content_url) {
            return { success: false, error: 'INVALID_UPLOAD_RESPONSE' };
        }

        return {
            success: true,
            contentId: data.content_id,
            attachmentId: data.id,
            url: data.content_url,
            previewUrl: data.content_preview_url || data.content_url,
            thumbnailUrl: data.image_data?.thumbnail_url || null,
            mimeType: data.mime_type || file.type || 'video/mp4',
            name: data.name || file.name || 'video.mp4',
            size: file.size,
            width: data.image_data?.width || null,
            height: data.image_data?.height || null,
            length: data.video_data?.length || null,
        };
    } catch (e) {
        console.error('[uploadVideoToPancakeAction] error:', e?.message || e);
        return { success: false, error: e?.message || 'UPLOAD_FAILED' };
    }
}

export async function uploadImageToPancakeAction(file, { pageId, accessToken } = {}) {
    try {
        if (!file) return { success: false, error: 'NO_FILE' };
        if (!pageId || !accessToken) {
            return { success: false, error: 'MISSING_PAGE_CREDENTIALS' };
        }

        const bytes = await file.arrayBuffer();
        const blob = new Blob([bytes], { type: file.type || 'image/jpeg' });
        const form = new FormData();
        form.append('file', blob, file.name || `image_${Date.now()}.jpg`);

        const uploadUrl = `https://pancake.vn/api/v1/pages/${pageId}/contents?access_token=${accessToken}`;

        const response = await fetch(uploadUrl, {
            method: 'POST',
            body: form,
            headers: {
                Accept: 'application/json',
            },
        });

        if (!response.ok) {
            const text = await response.text().catch(() => '');
            return { success: false, error: text || 'UPLOAD_FAILED' };
        }

        const data = await response.json().catch(() => null);

        if (!data?.content_id || !data?.id || !data?.content_url) {
            return { success: false, error: 'INVALID_UPLOAD_RESPONSE' };
        }

        return {
            success: true,
            contentId: data.content_id,
            attachmentId: data.id,
            url: data.content_url,
            previewUrl: data.content_preview_url || data.content_url,
            thumbnailUrl: data.image_data?.thumbnail_url || null,
            mimeType: data.mime_type || file.type || 'image/jpeg',
            name: data.name || file.name || 'image.jpg',
            size: file.size,
            width: data.image_data?.width || null,
            height: data.image_data?.height || null,
        };
    } catch (e) {
        console.error('[uploadImageToPancakeAction] error:', e?.message || e);
        return { success: false, error: e?.message || 'UPLOAD_FAILED' };
    }
}

// 2) Gửi ảnh vào hội thoại (content_url = link Drive)
export async function sendImageAction(pageId, accessToken, conversationId, imagePayload, message) {
    const normalizedPayload =
        typeof imagePayload === 'object' && imagePayload !== null
            ? imagePayload
            : { id: imagePayload };

    const {
        contentId,
        attachmentId,
        url,
        previewUrl,
        thumbnailUrl,
        mimeType,
        name,
        size,
        width,
        height,
    } = normalizedPayload || {};

    if (!contentId || !attachmentId || !url) {
        return { success: false, error: 'missing image metadata' };
    }

    const extraFields = {
        attachmentType: 'IMAGE',
        mime_type: mimeType || 'image/jpeg',
        name: name || 'image.jpg',
        attachment_id: attachmentId,
        content_id: contentId,
        is_reusable: 'true',
        file_size: size ? String(size) : undefined,
        width: typeof width === 'number' ? String(width) : undefined,
        height: typeof height === 'number' ? String(height) : undefined,
        thumbnail_url: thumbnailUrl || undefined,
        preview_url: previewUrl || undefined,
    };

    return sendMediaToConversation({
        pageId,
        accessToken,
        conversationId,
        contentUrl: url,
        message,
        contentType: 'photo',
        extraFields,
    });
}

// 2b) Gửi video vào hội thoại
export async function sendVideoAction(
    pageId,
    accessToken,
    conversationId,
    videoPayload,
    message = ''
) {
    try {
        if (!pageId || !accessToken || !conversationId || !videoPayload) {
            return { success: false, error: 'missing params' };
        }

        const {
            contentId,
            attachmentId,
            url,
            previewUrl,
            thumbnailUrl,
            mimeType,
            name,
            size,
            length,
            width,
            height,
        } = videoPayload || {};

        if (!contentId || !attachmentId || !url) {
            return { success: false, error: 'missing video metadata' };
        }

        const extraFields = {
            attachmentType: 'FILE',
            mime_type: mimeType || 'video/mp4',
            name: name || 'video.mp4',
            attachment_id: attachmentId,
            content_id: contentId,
            is_reusable: 'true',
            file_size: size ? String(size) : undefined,
            length: typeof length === 'number' ? String(length) : undefined,
            width: typeof width === 'number' ? String(width) : undefined,
            height: typeof height === 'number' ? String(height) : undefined,
            thumbnail_url: thumbnailUrl || undefined,
            preview_url: previewUrl || undefined,
        };

        const res = await sendMediaToConversation({
            pageId,
            accessToken,
            conversationId,
            contentUrl: url,
            message,
            contentType: 'video',
            extraFields,
        });

        if (res?.success) {
           
            return res;
        }

        console.warn('[sendVideoAction] ⚠️ unexpected response', res);
        return res;
    } catch (error) {
        console.error('[sendVideoAction] error:', error?.message || error);
        return { success: false, error: error?.message || 'SEND_VIDEO_FAILED' };
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
            `https://pancake.vn/api/v1/pages/${pageId}` +
            `/conversations/${conversationId}/messages?access_token=${accessToken}`;

        const payload = {
            action: 'reply_inbox',
            message: text,
            messaging_type: 'MESSAGE_TAG',
            tag: 'POST_PURCHASE_UPDATE',
            send_by_platform: "web"
        };
        let res = await fetch(url, {
            method: 'POST', body: JSON.stringify(payload), headers: {
                'Content-Type': 'application/json'     // cần có header này khi gửi JSON
            },
        });
        res = await res.json();
       
        if (res.success) return { success: true };
        return { success: false, error: 'Pancake API reported failure' };
    } catch (e) {
       
        return { success: false, error: e?.response?.data?.message || 'Failed to send message' };
    }
}
