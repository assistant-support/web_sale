import { NextResponse } from 'next/server';
import mongoose from 'mongoose';
import connectDB from '@/config/connectDB';
import Book from '@/models/book';
import authenticate from '@/utils/authenticate';
import { reloadBook } from '@/data/actions/reload';
import jsonRes from '@/utils/response';
import { CheckSlide } from '@/function/server';

// Thêm chủ đề mới vào chương trình học
export async function POST(request, { params }) {
    const { id } = await params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
        return NextResponse.json({ status: 1, mes: 'ID khóa học không hợp lệ.' }, { status: 400 });
    }

    try {
        const authResult = await authenticate(request);
        if (!authResult || !authResult.user) {
            return NextResponse.json({ status: 1, mes: 'Xác thực không thành công.', data: null }, { status: 401 });
        }
        const { user, body } = authResult;
        if (!user.role.includes('Admin') && !user.role.includes('Academic')) {
            return NextResponse.json({ status: 1, mes: 'Bạn không có quyền truy cập chức năng này.', data: null }, { status: 403 });
        }
        const { topics } = body;
        if (!topics || !Array.isArray(topics) || topics.length === 0) {
            return NextResponse.json({ status: 1, mes: 'Dữ liệu chủ đề không hợp lệ hoặc rỗng.' }, { status: 400 });
        }
        for (const topic of topics) {
            if (topic.Slide) {
                const validation = await CheckSlide(topic.Slide);
                if (!validation.isValid) {
                    return NextResponse.json({ status: 1, mes: `Chủ đề "${topic.Name}": ${validation.message}` }, { status: 400 });
                }
            }
        }
        await connectDB();
        const updatedBook = await Book.findByIdAndUpdate(id, { $push: { Topics: { $each: topics } } }, { new: true, runValidators: true, lean: true });
        reloadBook(id);
        if (!updatedBook) {
            return NextResponse.json({ status: 1, mes: 'Không tìm thấy khóa học để thêm chủ đề.' }, { status: 404 });
        }
        return NextResponse.json({ status: 2, mes: 'Thêm chủ đề mới thành công.', data: updatedBook }, { status: 200 });
    } catch (error) {
        if (error.name === 'ValidationError') {
            const firstErrorKey = Object.keys(error.errors)[0];
            return NextResponse.json({ status: 1, mes: error.errors[firstErrorKey].message }, { status: 400 });
        }
        console.error("POST /api/books/{id} Error:", error);
        return NextResponse.json({ status: 1, mes: 'Đã có lỗi xảy ra trên máy chủ.' }, { status: 500 });
    }
}

// Cập nhật thông tin // đổi vị trí chủ đề trong chương trình học
export async function PUT(request, { params }) {
    const { id } = await params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
        return jsonRes(400, { status: false, mes: 'ID khóa học không hợp lệ.' });
    }
    try {
        const { user, body } = await authenticate(request);
        if (!user.role.includes('Admin') && !user.role.includes('Academic')) {
            return jsonRes(403, { status: false, mes: 'Bạn không có quyền truy cập chức năng này.' });
        }
        await connectDB();
        let updatedBook;
        if (body.orderedTopicIds) {
            const book = await Book.findById(id);
            if (!book) return jsonRes(404, { status: false, mes: 'Không tìm thấy khóa học.' });
            const inactiveTopics = book.Topics.filter(t => t.Status === false);
            const orderedActiveTopics = body.orderedTopicIds
                .map(topicId => book.Topics.find(t => t._id.toString() === topicId))
                .filter(Boolean); 
            const originalActiveTopicCount = book.Topics.length - inactiveTopics.length;
            if (orderedActiveTopics.length !== originalActiveTopicCount) {
                return jsonRes(400, { status: false, mes: 'Danh sách ID chủ đề để sắp xếp không khớp.' });
            }
            book.Topics = [...orderedActiveTopics, ...inactiveTopics];
            updatedBook = await book.save();
        } else if (body.topicId && body.updateData) {
            if (!mongoose.Types.ObjectId.isValid(body.topicId)) {
                return jsonRes(400, { status: false, mes: 'ID chủ đề không hợp lệ.' });
            }
            if (body.updateData.Slide) {
                const validation = await CheckSlide(body.updateData.Slide);
                if (!validation.isValid) {
                    return jsonRes(400, { status: false, mes: validation.message });
                }
            }
            const updateFields = Object.entries(body.updateData).reduce((acc, [key, value]) => {
                acc[`Topics.$[elem].${key}`] = value;
                return acc;
            }, {});
            updatedBook = await Book.findByIdAndUpdate(id, { $set: updateFields }, {
                arrayFilters: [{ 'elem._id': new mongoose.Types.ObjectId(body.topicId) }],
                new: true, runValidators: true, lean: true
            });
        } else { return jsonRes(400, { status: false, mes: 'Dữ liệu không hợp lệ để cập nhật.' }); }
        if (!updatedBook) { return jsonRes(404, { status: false, mes: 'Không tìm thấy đối tượng để cập nhật.' }); }
        reloadBook(id);
        return jsonRes(200, { status: true, mes: 'Cập nhật thành công.', data: updatedBook });
    } catch (error) {
        if (error.name === 'ValidationError') {
            const firstErrorKey = Object.keys(error.errors)[0];
            return jsonRes(400, { status: false, mes: error.errors[firstErrorKey].message });
        }
        console.error("PUT /api/books/{id} Error:", error);
        return jsonRes(500, { status: false, mes: 'Đã có lỗi xảy ra trên máy chủ.' });
    }
}

// Vô hiệu hóa một chủ đề trong chương trình học
export async function DELETE(request, { params }) {
    const { id } = await params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
        return jsonRes(400, { status: false, mes: 'ID khóa học không hợp lệ.' });
    }
    try {
        const authResult = await authenticate(request);
        if (!authResult || !authResult.user) {
            return jsonRes(401, { status: false, mes: 'Xác thực không thành công.' });
        }
        const { user, body } = authResult;
        if (!user.role.includes('Admin') && !user.role.includes('Academic')) {
            return jsonRes(403, { status: false, mes: 'Bạn không có quyền truy cập chức năng này.' });
        }
        const { topicId } = body;
        if (!topicId || !mongoose.Types.ObjectId.isValid(topicId)) {
            return jsonRes(400, { status: false, mes: 'Yêu cầu phải có topicId hợp lệ.' });
        }
        await connectDB();
        const book = await Book.findById(id);
        if (!book) {
            return jsonRes(404, { status: false, mes: 'Không tìm thấy khóa học.' });
        }
        const topicIndex = book.Topics.findIndex(t => t._id.toString() === topicId);
        if (topicIndex === -1) {
            return jsonRes(404, { status: false, mes: 'Không tìm thấy chủ đề tương ứng trong khóa học.' });
        }
        if (book.Topics[topicIndex].Status === false) {
            return jsonRes(400, { status: false, mes: 'Chủ đề đã ở trạng thái vô hiệu hóa và đã ở cuối danh sách.' });
        }
        const [topicToMove] = book.Topics.splice(topicIndex, 1);
        topicToMove.Status = false;
        book.Topics.push(topicToMove);
        const updatedBook = await book.save();
        reloadBook(id);
        return jsonRes(200, { status: true, mes: 'Vô hiệu hóa và di chuyển chủ đề thành công.', data: updatedBook });
    } catch (error) {
        console.error("DELETE /api/books/{id} Error:", error);
        return jsonRes(500, { status: false, mes: 'Đã có lỗi xảy ra trên máy chủ.' });
    }
}