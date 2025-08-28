import { NextResponse } from 'next/server';
import { google } from 'googleapis';
import { Readable } from 'stream';
import connectDB from '@/config/connectDB';
import PostCourse from '@/models/course';
import TrialCourse from '@/models/coursetry';

async function getDriveClient() {
    const auth = new google.auth.GoogleAuth({
        projectId: process.env.GOOGLE_PROJECT_ID,
        credentials: {
            client_email: process.env.GOOGLE_CLIENT_EMAIL,
            private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
        },
        scopes: ['https://www.googleapis.com/auth/drive'],
    });
    return google.drive({ version: 'v3', auth });
}

export async function POST(request) {
    await connectDB();
    try {
        const drive = await getDriveClient();
        const formData = await request.formData();
        const folderId = formData.get('folderId');
        const file = formData.get('images');
        const fileType = formData.get('fileType');

        if (!folderId || !file || !fileType) {
            return NextResponse.json(
                { status: 1, mes: 'Thiếu tham số bắt buộc (folderId, images, fileType).' },
                { status: 400 }
            );
        }

        // --- 1. Tải file lên Google Drive ---
        const fileBuffer = Buffer.from(await file.arrayBuffer());
        const readableStream = new Readable();
        readableStream.push(fileBuffer);
        readableStream.push(null);

        const fileMetadata = { name: file.name, parents: [folderId] };
        const media = { mimeType: file.type, body: readableStream };

        const response = await drive.files.create({
            requestBody: fileMetadata,
            media: media,
            fields: 'id',
        });

        const uploadedId = response.data.id;
        if (!uploadedId) {
            throw new Error("Không thể lấy ID file từ Google Drive sau khi tải lên.");
        }

        // --- 2. Tạo đối tượng để lưu vào MongoDB ---
        const newMediaObject = { id: uploadedId, type: fileType, create: new Date() };

        // --- 3. Cập nhật vào MongoDB ---
        let updateResult = await PostCourse.updateOne(
            { 'Detail.Image': folderId },
            { $push: { 'Detail.$.DetailImage': newMediaObject } }
        );

        if (updateResult.matchedCount === 0) {
            updateResult = await TrialCourse.updateOne(
                { 'sessions.folderId': folderId },
                { $push: { 'sessions.$.images': newMediaObject } }
            );

            if (updateResult.matchedCount === 0) {
                await drive.files.delete({ fileId: uploadedId });
                throw new Error(`Không tìm thấy buổi học nào có Image ID (folderId) là '${folderId}'.`);
            }
        }

        // --- 4. Trả về thành công ---
        return NextResponse.json(
            {
                status: 2,
                mes: `Đã tải lên và cập nhật thành công tệp ${file.name}.`,
                data: [newMediaObject], // Giữ cấu trúc data là một mảng như client mong đợi
            },
            { status: 201 }
        );

    } catch (error) {
        const errorMessage = error.errors?.[0]?.message || error.message || 'Lỗi server không xác định.';
        console.error('Lỗi API [POST]:', JSON.stringify(error, null, 2));
        return NextResponse.json(
            { status: 1, mes: errorMessage },
            { status: error.code || 500 }
        );
    }
}



/**
 * @method PUT
 * @description Thay thế một file ảnh đã tồn tại bằng một file ảnh mới.
 * @body {FormData} - id (ID ảnh cũ cần thay thế), newImage (file ảnh mới)
 */
export async function PUT(request) {
    try {
        await connectDB();
        const drive = await getDriveClient();
        const formData = await request.formData();

        const oldImageId = formData.get('id');
        const newImageFile = formData.get('newImage');

        if (!oldImageId || !newImageFile) {
            return NextResponse.json(
                { status: 1, mes: 'Thiếu tham số bắt buộc: id (ảnh cũ) và newImage (file ảnh mới).' },
                { status: 400 }
            );
        }

        // --- 1. Tìm khóa học và buổi học chứa ảnh cũ ---
        let course = await PostCourse.findOne({ 'Detail.DetailImage.id': oldImageId });
        let isTrial = false;

        if (!course) {
            course = await TrialCourse.findOne({ 'sessions.images.id': oldImageId });
            if (!course) {
                return NextResponse.json(
                    { status: 1, mes: `Không tìm thấy buổi học nào chứa ảnh với ID: ${oldImageId}` },
                    { status: 404 }
                );
            }
            isTrial = true;
        }

        let folderId;
        if (!isTrial) {
            const lessonDetail = course.Detail.find(detail =>
                detail.DetailImage.some(img => img.id === oldImageId)
            );
            folderId = lessonDetail.Image;
        } else {
            const ses = course.sessions.find(s =>
                s.images?.some(img => img.id === oldImageId)
            );
            folderId = ses?.folderId;
        }

        if (!folderId) {
            return NextResponse.json(
                { status: 1, mes: 'Buổi học không có ID thư mục (folderId) được liên kết.' },
                { status: 500 }
            );
        }

        // --- 2. Tải file mới lên Google Drive ---
        const fileBuffer = Buffer.from(await newImageFile.arrayBuffer());
        const readableStream = new Readable();
        readableStream.push(fileBuffer);
        readableStream.push(null);

        const fileMetadata = { name: newImageFile.name, parents: [folderId] };
        const media = { mimeType: newImageFile.type, body: readableStream };

        const uploadResponse = await drive.files.create({
            requestBody: fileMetadata,
            media: media,
            fields: 'id',
        });

        const newImageId = uploadResponse.data.id;
        if (!newImageId) {
            throw new Error("Tải lên Google Drive thất bại, không nhận được ID file mới.");
        }

        // --- 3. Cập nhật ID mới vào MongoDB ---
        let updateResult = await PostCourse.updateOne(
            { 'Detail.DetailImage.id': oldImageId },
            { $set: { 'Detail.$.DetailImage.$[elem].id': newImageId } },
            { arrayFilters: [{ 'elem.id': oldImageId }] }
        );

        if (updateResult.modifiedCount === 0) {
            updateResult = await TrialCourse.updateOne(
                { 'sessions.images.id': oldImageId },
                { $set: { 'sessions.$[ses].images.$[img].id': newImageId } },
                { arrayFilters: [{ 'ses.images.id': oldImageId }, { 'img.id': oldImageId }] }
            );

            if (updateResult.modifiedCount === 0) {
                await drive.files.delete({ fileId: newImageId });
                throw new Error("Không thể cập nhật ID ảnh mới vào cơ sở dữ liệu.");
            }
        }

        // --- 4. Xóa file cũ khỏi Google Drive ---
        try {
            await drive.files.delete({ fileId: oldImageId });
        } catch (deleteError) {
            console.warn(`Không thể xóa file cũ ${oldImageId} khỏi Drive:`, deleteError.message);
        }

        // --- 5. Trả về thành công ---
        return NextResponse.json(
            { status: 2, mes: 'Thành công', data: newImageId },
            { status: 200 }
        );

    } catch (error) {
        console.error('Lỗi API [PUT]:', error);
        return NextResponse.json(
            { status: 1, mes: error.message || 'Lỗi server không xác định.' },
            { status: 500 }
        );
    }
}

export async function DELETE(request) {
    await connectDB();
    try {
        const drive = await getDriveClient();
        const { searchParams } = new URL(request.url);
        const id = searchParams.get('id');

        if (!id) {
            return NextResponse.json({ status: 1, mes: 'Thiếu ID của file cần xóa.' }, { status: 400 });
        }

        let updateResult = await PostCourse.updateOne(
            { 'Detail.DetailImage.id': id },
            { $pull: { 'Detail.$.DetailImage': { id: id } } }
        );

        if (updateResult.matchedCount === 0) {
            updateResult = await TrialCourse.updateOne(
                { 'sessions.images.id': id },
                { $pull: { 'sessions.$[].images': { id: id } } }
            );
            if (updateResult.matchedCount === 0) {
                return NextResponse.json({ status: 1, mes: 'Không tìm thấy file để xóa trong cơ sở dữ liệu.' }, { status: 404 });
            }
        }

        try {
            await drive.files.delete({ fileId: id });
        } catch (driveError) {
            console.warn(`Đã xóa file ${id} khỏi DB, nhưng không thể xóa khỏi Drive:`, driveError.message);
        }

        return NextResponse.json({ status: 2, mes: 'Xóa file thành công.' }, { status: 200 });
    } catch (error) {
        console.error('Lỗi API [DELETE]:', error);
        return NextResponse.json({ status: 1, mes: error.message || 'Lỗi server.' }, { status: 500 });
    }
}

