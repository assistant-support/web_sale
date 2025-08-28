import { NextResponse } from 'next/server';
import mongoose from 'mongoose';
import dbConnect from '@/config/connectDB';
import PostStudent from '@/models/student';
import PostCourse from '@/models/course';
import { revalidateTag } from 'next/cache';

export async function PATCH(request, { params }) {
    const { id: studentId } = await params;

    if (!mongoose.Types.ObjectId.isValid(studentId)) {
        return NextResponse.json({ success: false, message: 'ID học sinh không hợp lệ.' }, { status: 400 });
    }

    let body;
    try {
        body = await request.json();
    } catch (error) {
        return NextResponse.json({ success: false, message: 'Request body không phải là JSON hợp lệ.' }, { status: 400 });
    }

    const { action, note, courseId } = body;

    if (!action || !note) {
        return NextResponse.json({ success: false, message: 'Action và lý do (note) là bắt buộc.' }, { status: 400 });
    }

    await dbConnect();
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        const student = await PostStudent.findById(studentId).session(session);
        if (!student) {
            throw new Error('Không tìm thấy học sinh.');
        }

        switch (action) {
            case 'leave_permanently': {
                // 1. Tìm tất cả các khóa học ACTIVE mà học sinh đang tham gia.
                const studentCourseIds = student.Course.map(c => c.course);
                const activeCourses = await PostCourse.find({
                    _id: { $in: studentCourseIds },
                    Status: false,
                    'Student.ID': student.ID
                }, '_id').session(session).lean(); // Chỉ lấy _id để tối ưu

                const activeCourseIds = activeCourses.map(c => c._id);

                // 2. [SỬA LỖI] Cập nhật các khóa học:
                // KHÔNG xóa học sinh, chỉ xóa các buổi học chưa check-in trong mảng Learn của học sinh đó.
                if (activeCourseIds.length > 0) {
                    await PostCourse.updateMany(
                        {
                            _id: { $in: activeCourseIds },
                            'Student.ID': student.ID // Điều kiện để xác định đúng phần tử trong mảng Student
                        },
                        {
                            // $pull sẽ xóa các phần tử trong mảng 'Learn' của học sinh được tìm thấy ('Student.$')
                            $pull: { 'Student.$.Learn': { Checkin: 0 } }
                        }
                    ).session(session);
                }

                // 3. Cập nhật document của học sinh để bảo toàn dữ liệu.
                const leaveStatus = {
                    status: 0,
                    act: 'nghỉ',
                    date: new Date(),
                    note: note,
                };

                await PostStudent.updateOne(
                    { _id: studentId },
                    {
                        $push: { Status: leaveStatus },
                        $set: { 'Course.$[elem].status': 1 }
                    },
                    {
                        arrayFilters: [{ 'elem.course': { $in: activeCourseIds } }],
                        session
                    }
                );

                break;
            }

            case 'leave_course': {
                if (!courseId || !mongoose.Types.ObjectId.isValid(courseId)) {
                    throw new Error('ID khóa học không hợp lệ hoặc bị thiếu.');
                }
                await PostCourse.updateOne(
                    {
                        _id: courseId,
                        'Student.ID': student.ID
                    },
                    {
                        $pull: { 'Student.$.Learn': { Checkin: 0 } }
                    }
                ).session(session);
                const studentUpdateOps = {
                    $set: { 'Course.$[elem].status': 1 }
                };
                const studentUpdateOptions = {
                    arrayFilters: [{ 'elem.course': new mongoose.Types.ObjectId(courseId) }],
                    session,
                    new: true
                };

                // 3. Kiểm tra các khóa học active còn lại.
                const otherCourseIds = student.Course
                    .filter(c => c.course.toString() !== courseId)
                    .map(c => c.course);

                let otherActiveCoursesCount = 0;
                if (otherCourseIds.length > 0) {
                    otherActiveCoursesCount = await PostCourse.countDocuments({
                        _id: { $in: otherCourseIds },
                        Status: false
                    }).session(session);
                }

                // 4. Nếu không còn khóa active nào, thêm trạng thái "nghỉ".
                if (otherActiveCoursesCount === 0) {
                    const leaveStatus = {
                        status: 0,
                        act: 'nghỉ',
                        date: new Date(),
                        note: note,
                    };
                    studentUpdateOps.$push = { Status: leaveStatus };
                }

                await PostStudent.findByIdAndUpdate(
                    studentId,
                    studentUpdateOps,
                    studentUpdateOptions
                );

                break;
            }

            default:
                throw new Error('Hành động không hợp lệ.');
        }

        await session.commitTransaction();
        session.endSession();
        revalidateTag('student');
        revalidateTag('course');

        const finalStudentData = await PostStudent.findById(studentId);

        return NextResponse.json({ success: true, message: "Cập nhật thành công và bảo toàn dữ liệu.", data: finalStudentData }, { status: 200 });

    } catch (error) {
        await session.abortTransaction();
        session.endSession();
        console.error('API Error:', error);

        const errorMessage = error.message || 'Lỗi máy chủ nội bộ.';
        const statusCode = error.message.includes('Không tìm thấy') ? 404 : 500;

        return NextResponse.json({ success: false, message: errorMessage, error: error.message }, { status: statusCode });
    }
}