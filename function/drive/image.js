import { getDriveClient } from '@/function/drive/index';
import { Readable } from 'stream'

export async function uploadImageToDrive(file, folderId) {
    if (!file || file.size === 0) { return null; }

    try {
        const drive = await getDriveClient();
        const fileBuffer = Buffer.from(await file.arrayBuffer());
        const readableStream = new Readable();
        readableStream.push(fileBuffer);
        readableStream.push(null);

        const fileMetadata = { name: `avt-${Date.now()}-${file.name}`, parents: [folderId] };

        const media = { mimeType: file.type, body: readableStream };
        const response = await drive.files.create({
            requestBody: fileMetadata,
            media: media,
            fields: 'id',
        });
        if (response.data && response.data.id) {
            return response.data.id;
        } else {
            console.error("Google Drive API did not return a file ID after upload.");
            return null;
        }
    } catch (error) {
        console.error('Lỗi trong quá trình tải file lên Google Drive:', error);
        return null;
    }
}

export async function deleteImageFromDrive(fileId) {
    if (!fileId) {
        console.log("Không có fileId được cung cấp để xóa.");
        return false;
    }

    try {
        const drive = await getDriveClient();
        await drive.files.delete({ fileId: fileId });
        console.log(`File ${fileId} đã được xóa thành công khỏi Google Drive.`);
        return true;
    } catch (error) {
        if (error.code === 404) {
            console.warn(`File ${fileId} không tìm thấy trên Google Drive để xóa.`);
        } else {
            console.error(`Lỗi khi xóa file ${fileId} khỏi Google Drive:`, error);
        }
        return false;
    }
}