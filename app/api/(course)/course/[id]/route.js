import connectDB from '@/config/connectDB';
import PostCourse from '@/models/course';
import PostBook from '@/models/book';
import PostArea from '@/models/area';
import Postuser from '@/models/users';
import User from '@/models/users';
import PostStudent from '@/models/student';
import { NextResponse } from 'next/server';
import authenticate from '@/utils/authenticate';
import { GoogleGenerativeAI } from '@google/generative-ai'
import { reloadCourse, reloadStudent } from '@/data/actions/reload';
import { course_data } from '@/data/actions/get';

async function generateSummaryComment(comments) {
    if (!comments || comments.length === 0) {
        return "Học sinh đã hoàn thành khóa học. Cần theo dõi thêm để có nhận xét chi tiết.";
    }
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        console.warn("GEMINI_API_KEY chưa được cấu hình. Sử dụng nhận xét mặc định.");
        return "Học sinh đã hoàn thành khóa học đầy đủ các buổi.";
    }

    try {
        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

        const prompt = `
            Với vai trò là giáo viên nhận xét học sinh. Dựa trên danh sách các nhận xét rời rạc sau đây về một học sinh trong suốt khóa học, hãy viết một đoạn văn tổng kết dài (khoảng 400 chữ) về thái độ và kết quả học tập của học sinh này. Chỉ trả về đoạn văn, không thêm bất kỳ lời dẫn nào.
            DỮ LIỆU NHẬN XÉT:
            - ${comments.join('\n- ')}
        `;

        const result = await model.generateContent(prompt);
        return result.response.text().trim();
    } catch (error) {
        console.log(error);

        console.error("Lỗi khi gọi Gemini AI:", error);
        return "Học sinh đã hoàn thành các buổi học với sự tham gia tích cực.";
    }
}

// Xác nhận hoàn thành khóa học
export async function PATCH(request, { params }) {
    const { id } = await params;
    if (!id) return NextResponse.json({ status: 1, mes: 'Thiếu ID của khóa học.' }, { status: 400 });

    try {
        const { user, body } = await authenticate(request);
        if (Object.keys(body).length === 0) return NextResponse.json({ status: 1, mes: 'Không có dữ liệu để cập nhật.' }, { status: 400 });

        await connectDB();
        const course = await course_data(id);
        if (!course) return NextResponse.json({ status: 1, mes: 'Không tìm thấy khóa học.' }, { status: 404 });

        const isTeacherHR = course.TeacherHR?.toString() === user.id;
        const isAdmin = user.role?.includes('Admin');
        if (!isAdmin && !isTeacherHR) return NextResponse.json({ status: 1, mes: 'Bạn không có quyền thực hiện hành động này.' }, { status: 403 });

        delete body.ID;
        const updatedCourse = await PostCourse.findOneAndUpdate({ _id: id }, { $set: body }, { new: true }).populate('Book', 'ID Name').lean();
        if (!updatedCourse) return NextResponse.json({ status: 1, mes: 'Cập nhật khóa học thất bại.' }, { status: 404 });

        if (body.Status === true) {
            const studentIDsInCourse = updatedCourse.Student.map(s => s.ID);
            if (studentIDsInCourse.length > 0) {
                const students = await PostStudent.find({ ID: { $in: studentIDsInCourse } }).select('_id ID Course Profile');
                const bulkOperations = [];

                for (const student of students) {
                    await reloadStudent(student._id);
                    if (!student.Profile || typeof student.Profile !== 'object' || student.Profile === null) {
                        student.Profile = { Present: [] };
                    }

                    const studentInCourseData = updatedCourse.Student.find(s => s.ID === student.ID);
                    const allComments = studentInCourseData?.Learn.flatMap(l => l.Cmt || []).filter(cmt => cmt && cmt.trim() !== '');
                    const summaryComment = await generateSummaryComment(allComments);

                    const newPresentation = {
                        course: updatedCourse._id,
                        bookId: updatedCourse.Book.ID,
                        bookName: updatedCourse.Book.Name,
                        Comment: summaryComment,
                        Video: '',
                        Img: ''
                    };
                    console.log(newPresentation,1);
                    
                    const currentPresentations = student.Profile?.Present || [];
                    const otherPresentations = currentPresentations.filter(p => p.bookId !== updatedCourse.Book.ID);
                    const newPresentArray = [...otherPresentations, newPresentation];
                    const newProfileObject = {
                        ...student.Profile, 
                        Present: newPresentArray 
                    };

                    const hasOtherActiveCourses = student.Course.some(c => c.course.toString() !== updatedCourse._id.toString() && c.status === 0);
                    const newStatusForStudent = {
                        status: hasOtherActiveCourses ? 2 : 1, act: hasOtherActiveCourses ? 'học' : 'chờ',
                        date: new Date(), note: `Hoàn thành khóa học ${updatedCourse.ID}`
                    };
                    
                    bulkOperations.push({
                        updateOne: {
                            filter: { _id: student._id },
                            update: {
                                $set: {
                                    'Course.$[c].status': 2,
                                    'Profile': newProfileObject
                                },
                                $push: { Status: newStatusForStudent }
                            },
                            arrayFilters: [{ 'c.course': updatedCourse._id }]
                        }
                    });
                }

                if (bulkOperations.length > 0) {
                    await PostStudent.bulkWrite(bulkOperations);
                }
            }
        }

        reloadCourse(id);

        return NextResponse.json({ status: 2, mes: 'Cập nhật thành công.' }, { status: 200 });
    } catch (error) {
        console.error('[COURSE_UPDATE_ERROR]', error);
        return NextResponse.json({ status: 1, mes: error.message }, { status: 500 });
    }
}