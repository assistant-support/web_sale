import getDriveClient from '@/function/drive/index';
import { Readable } from 'stream';

/**
 * Cấp quyền xem công khai (reader) cho bất kỳ ai có link.
 * @param {import('googleapis').drive_v3.Drive} drive - Drive client đã xác thực.
 * @param {string} fileId - ID của file cần cấp quyền.
 * @returns {Promise<void>}
 */
async function setFilePermissionReader(drive, fileId) {
    try {
        await drive.permissions.create({
            fileId: fileId,
            requestBody: {
                role: 'reader',
                type: 'anyone',
            },
        });
        console.log(`Đã cấp quyền xem công khai cho file ${fileId}`);
    } catch (error) {
        console.error(`Không thể cấp quyền cho file ${fileId}:`, error);
        // Không throw lỗi để quá trình upload chính vẫn có thể thành công
    }
}

/**
 * Tải một file bất kỳ (ảnh, âm thanh,...) lên một thư mục trên Google Drive.
 * @param {File} file - Đối tượng file từ FormData.
 * @param {string} folderId - ID của thư mục cha trên Google Drive.
 * @returns {Promise<{id: string, webViewLink: string}|null>} 
 * Trả về object chứa ID và link xem file, hoặc null nếu có lỗi.
 */
export async function uploadFileToDrive(file, folderId) {
    if (!file || file.size === 0) {
        console.error("File không hợp lệ để tải lên.");
        return null;
    }

    try {
        const drive = await getDriveClient();
        
        // Chuyển file buffer thành stream
        const fileBuffer = Buffer.from(await file.arrayBuffer());
        const readableStream = new Readable();
        readableStream.push(fileBuffer);
        readableStream.push(null);

        const fileMetadata = {
            name: `${Date.now()}-${file.name}`, // Tên file duy nhất
            parents: [folderId]
        };

        const media = {
            mimeType: file.type,
            body: readableStream
        };

        const response = await drive.files.create({
            requestBody: fileMetadata,
            media: media,
            fields: 'id, webViewLink', // Lấy cả ID và link xem
        });

        if (response.data?.id) {
            // Sau khi tải lên thành công, cấp quyền xem công khai
            await setFilePermissionReader(drive, response.data.id);
            return response.data;
        } else {
            console.error("Google Drive API không trả về ID file.");
            return null;
        }
    } catch (error) {
        console.error('Lỗi trong quá trình tải file lên Google Drive:', error);
        return null;
    }
}
