import { NextResponse } from 'next/server';
import { google } from 'googleapis';
import { Readable } from 'stream';
import connectDB from '@/config/connectDB';
import PostCourse from '@/models/course';

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

function getSimplifiedType(mimeType) {
    if (mimeType.startsWith('image/')) {
        return 'image';
    }
    if (mimeType.startsWith('video/')) {
        return 'video';
    }
    return 'file';
}

export async function POST(request) {
    await connectDB();
    try {
        const drive = await getDriveClient();
        const formData = await request.formData();
        const folderId = formData.get('folderId'); // This folderId is expected to be Detail.Image
        const file = formData.get('images');

        if (!folderId || !file) {
            return NextResponse.json(
                { status: 1, mes: 'Thiếu tham số bắt buộc (folderId, images).' },
                { status: 400 }
            );
        }

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

        const simplifiedType = getSimplifiedType(file.type);

        const newMediaObject = {
            id: uploadedId,
            type: simplifiedType,
            create: new Date()
        };

        const updateResult = await PostCourse.updateOne(
            { 'Detail.Image': folderId },
            { $push: { 'Detail.$.DetailImage': newMediaObject } }
        );

        if (updateResult.matchedCount === 0) {
            await drive.files.delete({ fileId: uploadedId });
            throw new Error(`Không tìm thấy buổi học nào có Image ID (folderId) là '${folderId}' để thêm ảnh.`);
        }

        // --- Prepare data for response: Return the _id of the affected Detail object ---
        const updatedCourse = await PostCourse.findOne(
            { 'Detail.Image': folderId },
            { 'Detail._id': 1 } // Project only the matched Detail's _id
        );

        let affectedDetailIds = [];
        if (updatedCourse && updatedCourse.Detail.length > 0 && updatedCourse.Detail[0]._id) {
            affectedDetailIds.push(updatedCourse.Detail[0]._id.toString()); // Convert ObjectId to string
        }

        return NextResponse.json(
            { status: 2, mes: `Đã tải lên và thêm thành công tệp ${file.name}.`, data: affectedDetailIds },
            { status: 201 }
        );

    } catch (error) {
        console.error('Lỗi API [POST]:', error);
        return NextResponse.json(
            { status: 1, mes: error.message || 'Lỗi server không xác định.' },
            { status: error.code || 500 }
        );
    }
}

export async function PUT(request) {
    await connectDB();
    try {
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

        const course = await PostCourse.findOne({
            $or: [
                { 'Detail.DetailImage.id': oldImageId },
                { 'Student.Learn.Image.id': oldImageId }
            ]
        });

        if (!course) {
            return NextResponse.json(
                { status: 1, mes: `Không tìm thấy ảnh với ID: ${oldImageId} trong bất kỳ khóa học nào.` },
                { status: 404 }
            );
        }

        let folderIdToUpload = null;
        let affectedCourseId = course._id;
        let affectedDetailObjectId = null;
        let updatedInDetail = false;

        // Determine folderId and set flags if Detail is affected
        for (const detail of course.Detail) {
            if (detail.DetailImage && detail.DetailImage.some(img => img.id === oldImageId)) {
                folderIdToUpload = detail.Image;
                affectedDetailObjectId = detail._id;
                updatedInDetail = true;
                break;
            }
        }

        // If not found in Detail, try Student.Learn.Image to get folderId fallback
        if (!folderIdToUpload) {
            for (const student of course.Student) {
                if (student.Learn) {
                    for (const learnDetail of student.Learn) {
                        if (learnDetail.Image && learnDetail.Image.some(img => img.id === oldImageId)) {
                            if (course.Detail && course.Detail.length > 0 && course.Detail[0].Image) {
                                folderIdToUpload = course.Detail[0].Image; // Fallback folderId
                            } else {
                                throw new Error("Không thể xác định thư mục tải lên cho ảnh học sinh.");
                            }
                            break;
                        }
                    }
                }
                if (folderIdToUpload) break;
            }
        }

        if (!folderIdToUpload) {
            return NextResponse.json(
                { status: 1, mes: `Không thể xác định thư mục để tải ảnh mới lên cho ảnh cũ ID: ${oldImageId}.` },
                { status: 400 }
            );
        }

        const fileBuffer = Buffer.from(await newImageFile.arrayBuffer());
        const readableStream = new Readable();
        readableStream.push(fileBuffer);
        readableStream.push(null);

        const fileMetadata = { name: newImageFile.name, parents: [folderIdToUpload] };
        const media = { mimeType: newImageFile.type, body: readableStream };

        const uploadResponse = await drive.files.create({
            requestBody: fileMetadata,
            media: media,
            fields: 'id',
        });

        const newUploadedId = uploadResponse.data.id;
        const newSimplifiedType = getSimplifiedType(newImageFile.type);

        if (!newUploadedId) {
            throw new Error("Tải lên Google Drive thất bại, không nhận được ID file mới.");
        }

        const newImageObject = { // This object represents the new image saved to DB
            id: newUploadedId,
            type: newSimplifiedType,
            create: new Date(),
        };

        const updateOperations = [];

        // Update in Detail.DetailImage if it was the affected part
        if (updatedInDetail) {
            updateOperations.push(
                PostCourse.updateOne(
                    { '_id': affectedCourseId, 'Detail._id': affectedDetailObjectId, 'Detail.DetailImage.id': oldImageId },
                    {
                        $set: {
                            'Detail.$[detailElem].DetailImage.$[elem].id': newImageObject.id,
                            'Detail.$[detailElem].DetailImage.$[elem].type': newImageObject.type,
                            'Detail.$[detailElem].DetailImage.$[elem].create': newImageObject.create,
                        }
                    },
                    { arrayFilters: [{ 'detailElem._id': affectedDetailObjectId }, { 'elem.id': oldImageId }] }
                )
            );
        } else { // If not Detail, then it must be Student.Learn.Image (update, but don't return its ID in data)
            updateOperations.push(
                PostCourse.updateOne(
                    { '_id': affectedCourseId, 'Student.Learn.Image.id': oldImageId },
                    {
                        $set: {
                            'Student.$.Learn.$[learnElem].Image.$[imageElem].id': newImageObject.id,
                            'Student.$.Learn.$[learnElem].Image.$[imageElem].type': newImageObject.type,
                            'Student.$.Learn.$[learnElem].Image.$[imageElem].create': newImageObject.create,
                        }
                    },
                    {
                        arrayFilters: [
                            { 'learnElem.Image.id': oldImageId },
                            { 'imageElem.id': oldImageId }
                        ]
                    }
                )
            );
        }


        const results = await Promise.all(updateOperations);
        const modifiedCount = results.reduce((acc, res) => acc + res.modifiedCount, 0);

        if (modifiedCount === 0) {
            await drive.files.delete({ fileId: newUploadedId });
            throw new Error("Không tìm thấy ảnh cũ hoặc không thể cập nhật ảnh mới vào cơ sở dữ liệu.");
        }

        try {
            await drive.files.delete({ fileId: oldImageId });
        } catch (deleteError) {
            console.warn(`Không thể xóa file cũ ${oldImageId} khỏi Drive:`, deleteError.message);
        }

        // --- Prepare data for response: Return the _id of the affected Detail object if updatedInDetail is true ---
        let affectedDetailIds = [];
        if (updatedInDetail) {
            affectedDetailIds.push(affectedDetailObjectId.toString()); // Convert ObjectId to string
        }

        return NextResponse.json(
            { status: 2, mes: 'Thay thế ảnh thành công.', data: affectedDetailIds },
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

        let affectedCourseId = null;
        let affectedDetailObjectId = null;
        let deletedFromDetail = false;

        // Find the course and identify the parent object (Detail or LearnDetail)
        const course = await PostCourse.findOne({
            $or: [
                { 'Detail.DetailImage.id': id },
                { 'Student.Learn.Image.id': id }
            ]
        });

        if (!course) {
            return NextResponse.json({ status: 1, mes: 'Không tìm thấy file để xóa trong cơ sở dữ liệu.' }, { status: 404 });
        }
        affectedCourseId = course._id;

        // Determine if deletion is from Detail.DetailImage
        for (const detail of course.Detail) {
            if (detail.DetailImage && detail.DetailImage.some(img => img.id === id)) {
                affectedDetailObjectId = detail._id;
                deletedFromDetail = true;
                break;
            }
        }

        const updateOperations = [];

        // If from Detail.DetailImage
        if (deletedFromDetail) {
            updateOperations.push(
                PostCourse.updateOne(
                    { '_id': affectedCourseId, 'Detail._id': affectedDetailObjectId, 'Detail.DetailImage.id': id },
                    { $pull: { 'Detail.$.DetailImage': { id: id } } }
                )
            );
        } else { // If from Student.Learn.Image (delete, but don't return its ID in data)
            updateOperations.push(
                PostCourse.updateOne(
                    { '_id': affectedCourseId, 'Student.Learn.Image.id': id },
                    { $pull: { 'Student.$.Learn.$[learnElem].Image': { id: id } } },
                    { arrayFilters: [{ 'learnElem.Image.id': id }] }
                )
            );
        }

        const results = await Promise.all(updateOperations);
        const modifiedCount = results.reduce((acc, res) => acc + res.modifiedCount, 0);

        if (modifiedCount === 0) {
            return NextResponse.json({ status: 1, mes: 'Không tìm thấy file để xóa trong cơ sở dữ liệu.' }, { status: 404 });
        }

        try {
            await drive.files.delete({ fileId: id });
        } catch (driveError) {
            console.warn(`Không thể xóa file ${id} khỏi DB, nhưng không thể xóa khỏi Drive:`, driveError.message);
        }

        let affectedDetailIds = [];
        if (deletedFromDetail) {
            affectedDetailIds.push(affectedDetailObjectId.toString());
        }

        return NextResponse.json({ status: 2, mes: 'Xóa file thành công.', data: affectedDetailIds }, { status: 200 });

    } catch (error) {
        console.error('Lỗi API [DELETE]:', error);
        return NextResponse.json(
            { status: 1, mes: error.message || 'Lỗi server không xác định.' },
            { status: 500 }
        );
    }
}