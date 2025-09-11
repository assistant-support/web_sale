// /lib/drive.js
import { google } from 'googleapis';
import { Readable } from 'node:stream';

const DRIVE_DEBUG = process.env.DRIVE_DEBUG === 'true';

// Log helper (bật khi DRIVE_DEBUG=true)
function dlog(...args) {
    if (DRIVE_DEBUG) console.log('[drive]', ...args);
}

// Mask helper cho private_key
function maskKey(key) {
    if (!key) return '(empty)';
    const flat = String(key).replace(/\n/g, '\\n');
    return `${flat.slice(0, 10)}...len=${flat.length}`;
}

// Build URL mở ảnh từ Drive ID (tiện cho log)
export function viewUrlFromId(id) {
    return id ? `https://lh3.googleusercontent.com/d/${id}` : null;
}

export async function getDriveClient() {
    // 1) Kiểm tra env
    dlog('getDriveClient(): env', {
        GOOGLE_PROJECT_ID: process.env.GOOGLE_PROJECT_ID || '(empty)',
        GOOGLE_CLIENT_EMAIL: process.env.GOOGLE_CLIENT_EMAIL || '(empty)',
        GOOGLE_PRIVATE_KEY_len: process.env.GOOGLE_PRIVATE_KEY
            ? String(process.env.GOOGLE_PRIVATE_KEY).length
            : 0,
        GOOGLE_PRIVATE_KEY_mask: maskKey(process.env.GOOGLE_PRIVATE_KEY),
        scopes: 'https://www.googleapis.com/auth/drive',
    });

    // 2) Tạo auth
    let auth;
    try {
        auth = new google.auth.GoogleAuth({
            projectId: process.env.GOOGLE_PROJECT_ID,
            credentials: {
                client_email: process.env.GOOGLE_CLIENT_EMAIL,
                private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
            },
            scopes: ['https://www.googleapis.com/auth/drive'],
        });
        dlog('GoogleAuth created OK');
    } catch (err) {
        console.error('[drive] GoogleAuth error:', err?.message, err);
        throw err;
    }

    // 3) Tạo client
    let drive;
    try {
        drive = google.drive({ version: 'v3', auth });
        dlog('google.drive client created OK');
    } catch (err) {
        console.error('[drive] google.drive init error:', err?.message, err);
        throw err;
    }

    // 4) Ping nhỏ để chắc chắn auth hoạt động
    try {
        if (DRIVE_DEBUG) {
            const about = await drive.about.get({ fields: 'user, storageQuota' });
            dlog('about.get OK:', {
                user: about?.data?.user?.emailAddress,
                displayName: about?.data?.user?.displayName,
            });
        }
    } catch (err) {
        console.error('[drive] about.get error (auth/perm?):', err?.message, err?.response?.data || err);
        // không throw ở đây để vẫn trả drive client cho caller dùng tiếp
    }

    return drive;
}

/**
 * Chuyển Buffer sang Readable stream (an toàn ESM)
 */
function readableFromBuffer(buffer) {
    // Ghi chú: googleapis chấp nhận Buffer hoặc Stream. Stream thường an toàn hơn với request lớn.
    return Readable.from(buffer);
}

/**
 * Upload buffer/stream lên Drive.
 * - name: tên file
 * - mime: MIME type (vd: image/jpeg)
 * - buffer: Buffer | Readable
 * - folderId: id thư mục (service account PHẢI có quyền trên thư mục này!)
 */
export async function uploadBufferToDrive({
    name,
    mime,
    buffer,
    folderId = '19-dJALj2I-mDwNn6SNSkIl92a5MeEP5Y',
}) {
    const drive = await getDriveClient();

    // 1) Chuẩn bị metadata & media
    const metadata = {
        name: name || `upload-${Date.now()}`,
        ...(folderId ? { parents: [folderId] } : {}),
    };

    const isBuf = Buffer.isBuffer(buffer);
    const body = isBuf ? readableFromBuffer(buffer) : buffer;

    const media = {
        mimeType: mime || 'application/octet-stream',
        body,
    };

    dlog('files.create metadata:', metadata);
    dlog('files.create media:', {
        mimeType: media.mimeType,
        bodyType: isBuf ? 'Readable(from Buffer)' : (body?.readable ? 'Readable' : typeof body),
    });

    // 2) Upload file
    let createResp;
    try {
        createResp = await drive.files.create({
            requestBody: metadata,
            media,
            fields: 'id, name, webViewLink, webContentLink, thumbnailLink',
        });
        dlog('files.create OK:', createResp?.data);
    } catch (err) {
        // In chi tiết lỗi từ Google API
        console.error('[drive] files.create error:', err?.message);
        if (err?.errors) console.error('[drive] errors:', err.errors);
        if (err?.response?.data) console.error('[drive] response.data:', err.response.data);
        throw err;
    }

    const fileId = createResp?.data?.id;
    if (!fileId) {
        console.error('[drive] createResp missing file id');
        throw new Error('Google Drive: Upload succeeded but no file id returned.');
    }

    // 3) Set permission public (nếu cần)
    try {
        await drive.permissions.create({
            fileId,
            requestBody: { role: 'reader', type: 'anyone' },
        });
        dlog('permissions.create OK for fileId:', fileId);
    } catch (err) {
        // Một số workspace hạn chế chia sẻ công khai → ghi log nhưng không fail
        console.warn('[drive] permissions.create warning:', err?.message);
        if (err?.response?.data) console.warn('[drive] perm response.data:', err.response.data);
    }

    // 4) Lấy lại info cuối cùng để trả về
    try {
        const info = await drive.files.get({
            fileId,
            fields: 'id, name, webViewLink, webContentLink, thumbnailLink',
        });
        dlog('files.get OK:', info?.data);
        return info?.data; // { id, name, webViewLink, webContentLink, thumbnailLink }
    } catch (err) {
        console.error('[drive] files.get error:', err?.message, err?.response?.data || err);
        // ít nhất trả lại id để UI tiếp tục dùng
        return { id: fileId };
    }
}
