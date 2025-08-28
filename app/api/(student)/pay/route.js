import connectDB from '@/config/connectDB';
import PostStudent from '@/models/student';
import Invoice from '@/models/invoices';
import '@/models/course';
import '@/models/book';
import '@/models/users';
import { NextResponse } from 'next/server';
import authenticate from '@/utils/authenticate';
import { revalidateTag } from 'next/cache';
import { reloadCourse, reloadStudent } from '@/data/actions/reload';

export async function GET(request, { params }) {
    try {
        const { searchParams } = new URL(request.url);
        const _id = searchParams.get('_id');

        if (!_id) {
            return NextResponse.json(
                { status: 1, mes: 'Vui lòng cung cấp ID của hóa đơn.', data: [] },
                { status: 400 }
            );
        }

        await connectDB();

        const invoice = await Invoice.findById(_id)
            .populate({
                path: 'studentId',
                select: 'ID Name Phone Email BD Address'
            })
            .populate({
                path: 'courseId',
                select: 'ID Book',
                populate: {
                    path: 'Book',
                    model: 'book',
                    select: 'Name Price'
                }
            })
            .populate({
                path: 'createBy',
                select: 'name phone',
            })
            .lean();
        if (!invoice) {
            return NextResponse.json(
                { status: 1, mes: `Không tìm thấy hóa đơn với ID: ${_id}`, data: [] },
                { status: 404 }
            );
        }
        return NextResponse.json(
            { status: 2, mes: 'Lấy thông tin hóa đơn thành công.', data: [invoice] },
            { status: 200 }
        );

    } catch (error) {
        console.error(error);
        if (error.kind === 'ObjectId') {
            return NextResponse.json(
                { status: 1, mes: 'ID hóa đơn không hợp lệ.', data: [] },
                { status: 400 }
            );
        }
        return NextResponse.json(
            { status: 0, mes: 'Lỗi máy chủ khi lấy thông tin hóa đơn.', data: [] },
            { status: 500 }
        );
    }
}

export async function POST(request) {
    try {
        const { user, body } = await authenticate(request);
        if (!user) {
            return NextResponse.json(
                { status: 1, mes: 'Xác thực không thành công.', data: [] },
                { status: 401 }
            );
        }

        if (!user.role.includes('Admin')) {
            return NextResponse.json(
                { status: 1, mes: 'Không có quyền truy cập chức năng này.', data: [] },
                { status: 403 }
            );
        }

        await connectDB();
        const { studentId, courseId, amountInitial, amountPaid, paymentMethod, discount } = body;

        if (!studentId || !courseId || amountInitial === undefined || amountPaid === undefined) {
            return NextResponse.json(
                { status: 1, mes: 'Vui lòng cung cấp đủ thông tin bắt buộc.', data: [] },
                { status: 400 }
            );
        }

        const newInvoice = new Invoice({
            studentId, courseId, amountInitial, amountPaid, paymentMethod, discount, createBy: user.id,
        });
        const savedInvoice = await newInvoice.save();

        const updatedStudent = await PostStudent.findOneAndUpdate(
            { _id: studentId, 'Course.course': courseId },
            { $set: { 'Course.$.tuition': savedInvoice._id } },
            { new: true }
        );

        if (!updatedStudent) {
            console.warn(`Invoice ${savedInvoice._id} created, but student ${studentId} with course ${courseId} not found for update.`);
            return NextResponse.json(
                { status: 1, mes: `Tạo hóa đơn thành công, nhưng không tìm thấy khóa học của học sinh để cập nhật.`, data: [savedInvoice] },
                { status: 200 }
            );
        }
        reloadCourse(courseId);
        reloadStudent(studentId);
        return NextResponse.json(
            { status: 2, mes: 'Tạo hóa đơn và cập nhật học sinh thành công.', data: [savedInvoice] },
            { status: 201 }
        );

    } catch (error) {
        console.error('API POST Error:', error);
        if (error.name === 'ValidationError') {
            const messages = Object.values(error.errors).map(e => e.message).join(' ');
            return NextResponse.json(
                { status: 1, mes: `Lỗi xác thực dữ liệu: ${messages}`, data: [] },
                { status: 400 }
            );
        }

        return NextResponse.json(
            { status: 0, mes: 'Lỗi từ máy chủ, không thể xử lý yêu cầu.', data: [] },
            { status: 500 }
        );
    }
}