import PostBook from '@/models/book';
import connectDB from '@/config/connectDB';
import authenticate from '@/utils/authenticate';
import jsonRes from '@/utils/response';
import { uploadImageToDrive, deleteImageFromDrive } from '@/function/drive/image';
import { reloadBook } from '@/data/actions/reload';
export async function POST(request) {
    let coverImageId = null;
    let badgeImageId = null;
    try {
        const { user } = await authenticate(request);
        if (!user) return jsonRes(401, { status: false, mes: 'Xác thực không thành công.' });
        if (!user.role.includes('Admin') && !user.role.includes('Academic')) {
            return jsonRes(403, { status: false, mes: 'Bạn không có quyền truy cập chức năng này.' });
        }
        const formData = await request.formData();
        const ID = formData.get('ID');
        const Name = formData.get('Name');
        const Type = formData.get('Type');
        const Price = formData.get('Price');
        const Describe = formData.get('Describe');
        const ImageFile = formData.get('Image');
        const BadgeFile = formData.get('Badge');
        const TopicsStr = formData.get('Topics');
        if (!ID || !Name || !Type || Price === null || Price === undefined || !ImageFile || ImageFile.size === 0) {
            return jsonRes(400, { status: false, mes: 'Các trường ID, Name, Type, Price là bắt buộc.' });
        }
        await connectDB();
        const normalizedID = ID.toUpperCase();
        const existingBook = await PostBook.findOne({ ID: normalizedID }).lean();
        if (existingBook) {
            return jsonRes(409, { status: false, mes: `ID '${normalizedID}' đã tồn tại.` });
        }
        const FOLDER_ID = '1GofTISCOas5dgzSfD5q54TXsrY28RYp8';
        if (ImageFile && ImageFile.size > 0) {
            coverImageId = await uploadImageToDrive(ImageFile, FOLDER_ID);
            if (!coverImageId) return jsonRes(500, { status: false, mes: 'Tải ảnh bìa lên thất bại.' });
        }
        if (BadgeFile && BadgeFile.size > 0) {
            badgeImageId = await uploadImageToDrive(BadgeFile, FOLDER_ID);
        }
        const newBook = new PostBook({ ID: normalizedID, Name, Type, Price: Number(Price) || 0, Describe, Image: coverImageId, Badge: badgeImageId, Topics: TopicsStr ? JSON.parse(TopicsStr) : [] });
        const savedBook = await newBook.save();
        reloadBook();
        return jsonRes(201, { status: true, mes: 'Thêm chương trình thành công.', data: savedBook });
    } catch (error) {
        await Promise.all([
            coverImageId && deleteImageFromDrive(coverImageId),
            badgeImageId && deleteImageFromDrive(badgeImageId)
        ].filter(Boolean));
        console.error("Lỗi khi tạo chương trình:", error);
        return jsonRes(500, { status: false, mes: 'Lỗi máy chủ: Không thể tạo chương trình.' });
    }
}

export async function PUT(request) {
    let newCoverImageId = null;
    let newBadgeImageId = null;

    try {
        // 1. Xác thực và phân quyền người dùng
        const { user } = await authenticate(request);
        if (!user) return jsonRes(401, { status: false, mes: 'Xác thực không thành công.' });
        if (!user.role.includes('Admin') && !user.role.includes('Academic')) {
            return jsonRes(403, { status: false, mes: 'Bạn không có quyền truy cập chức năng này.' });
        }
        const formData = await request.formData();
        const ID = formData.get('ID');
        const Name = formData.get('Name');
        const Price = formData.get('Price');
        const Describe = formData.get('Describe');
        const ImageFile = formData.get('Image');
        const BadgeFile = formData.get('Badge');
        if (!ID || !Name) {
            return jsonRes(400, { status: false, mes: 'Thiếu các trường bắt buộc: idbook, ID, Name.' });
        }
        await connectDB();
        const bookToUpdate = await PostBook.findById(ID);
        if (!bookToUpdate) {
            return jsonRes(404, { status: false, mes: 'Không tìm thấy chương trình học để cập nhật.' });
        }
        const oldCoverImageId = bookToUpdate.Image;
        const oldBadgeImageId = bookToUpdate.Badge;
        const FOLDER_ID = '1GofTISCOas5dgzSfD5q54TXsrY28RYp8';
        if (ImageFile && ImageFile.size > 0) {
            newCoverImageId = await uploadImageToDrive(ImageFile, FOLDER_ID);
            if (!newCoverImageId) return jsonRes(500, { status: false, mes: 'Tải ảnh bìa mới lên thất bại.' });
        }
        if (BadgeFile && BadgeFile.size > 0) {
            newBadgeImageId = await uploadImageToDrive(BadgeFile, FOLDER_ID);
        }
        bookToUpdate.Name = Name;
        bookToUpdate.Price = Number(Price) || 0;
        bookToUpdate.Describe = Describe;
        if (newCoverImageId) bookToUpdate.Image = newCoverImageId;
        if (newBadgeImageId) bookToUpdate.Badge = newBadgeImageId;

        const updatedBook = await bookToUpdate.save();
        if (newCoverImageId && oldCoverImageId) {
            await deleteImageFromDrive(oldCoverImageId);
        }
        if (newBadgeImageId && oldBadgeImageId) {
            await deleteImageFromDrive(oldBadgeImageId);
        }
        reloadBook(ID);
        return jsonRes(200, { status: true, mes: 'Cập nhật chương trình thành công.', data: updatedBook });
    } catch (error) {
        await Promise.all([
            newCoverImageId && deleteImageFromDrive(newCoverImageId),
            newBadgeImageId && deleteImageFromDrive(newBadgeImageId)
        ].filter(Boolean));
        console.error("Lỗi khi cập nhật chương trình:", error);
        return jsonRes(500, { status: false, mes: 'Lỗi máy chủ: Không thể cập nhật chương trình.' });
    }
}