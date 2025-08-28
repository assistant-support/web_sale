import { NextResponse } from 'next/server';
import mongoose from 'mongoose';
import connectDB from '@/config/connectDB';
import PostStudent from '@/models/student';
import PostCourse from '@/models/course';
import Book from '@/models/book';
import User from '@/models/users';

if (!mongoose.models.user) {
    const userSchema = new mongoose.Schema({ Name: String, Phone: String });
    mongoose.model('user', userSchema);
}

export async function GET(request, { params }) {
    try {
        const { id } = params;

        if (!id || id.length !== 48) {
            return NextResponse.json(
                { status: false, mes: 'Tham số không hợp lệ', data: null },
                { status: 400 }
            );
        }

        const studentId = id.substring(0, 24);
        const courseId = id.substring(24);

        await connectDB();

        const [student, course] = await Promise.all([
            PostStudent.findById(studentId).lean(),
            PostCourse.findById(courseId)
                .populate({ path: 'Book' })
                .populate({ path: 'TeacherHR', select: 'name phone' })
                .populate({ path: 'Detail.Teacher', select: 'name' })
                .populate({ path: 'Detail.TeachingAs', select: 'name' })
                .lean()
        ]);

        if (!student || !course) {
            return NextResponse.json(
                { status: false, mes: 'Không tìm thấy học sinh hoặc khóa học', data: null },
                { status: 404 }
            );
        }

        const studentInCourseData = course.Student.find(s => s.ID === student.ID);
        if (!studentInCourseData) {
            return NextResponse.json(
                { status: false, mes: 'Học sinh không thuộc khóa học này', data: null },
                { status: 404 }
            );
        }

        const learnMap = new Map(studentInCourseData.Learn.map(l => [l.Lesson.toString(), l]));
        const topicMap = new Map(course.Book?.Topics?.map(t => [t._id.toString(), t.Name]) || []);

        let stats = {
            official: { total: 0, attended: 0, absent_K: 0, absent_P: 0, unchecked: 0 },
            makeup: { total: 0, attended: 0, absent_K: 0, absent_P: 0, unchecked: 0 }
        };

        const lessonsWithLearnData = course.Detail.map(lessonDetail => {
            const lessonIdStr = lessonDetail._id.toString();
            const learnProgress = learnMap.get(lessonIdStr);
            const checkinStatus = learnProgress?.Checkin ?? 0;

            const isMakeupLesson = lessonDetail.Type === 'Học bù';
            const statsKey = isMakeupLesson ? 'makeup' : 'official';
            stats[statsKey].total++;

            switch (checkinStatus) {
                case 1: stats[statsKey].attended++; break;
                case 2: stats[statsKey].absent_K++; break;
                case 3: stats[statsKey].absent_P++; break;
                default: stats[statsKey].unchecked++; break;
            }

            const combinedLesson = {
                ...lessonDetail,
                _id: lessonIdStr,
                TopicName: topicMap.get(lessonDetail.Topic?.toString()) || 'Không có chủ đề',
                Learn: learnProgress || null,
            };

            if (learnProgress?.Image) {
                combinedLesson.ImageStudent = learnProgress.Image;
                delete combinedLesson.Learn.Image;
            }
            delete combinedLesson.DetailImage
            return combinedLesson;
        });

        const totalLessons = course.Detail.length;
        const startDate = totalLessons > 0 ? course.Detail[0].Day : null;
        const endDate = totalLessons > 0 ? course.Detail[totalLessons - 1].Day : null;

        const formattedData = {
            studentInfo: {
                _id: student._id,
                Name: student.Name,
                Avatar: student.Avt,
            },
            courseInfo: {
                courseName: course.ID,
                programName: course.Book?.Name || "N/A",
                studyTime: startDate && endDate
                    ? `${new Date(startDate).toLocaleDateString('vi-VN')} - ${new Date(endDate).toLocaleDateString('vi-VN')}`
                    : "N/A",
                headTeacher: course.TeacherHR?.name || "N/A",
                headTeacherPhone: course.TeacherHR?.phone || "N/A",
            },
            officialLessonStats: {
                title: "Buổi học chính thức",
                total: stats.official.total,
                attended: stats.official.attended,
                absent_P: stats.official.absent_P,
                absent_K: stats.official.absent_K,
                makeupNeeded: stats.official.absent_P + stats.official.absent_K,
            },
            makeupLessonStats: {
                title: "Thống kê học bù",
                total: stats.makeup.total,
                attended: stats.makeup.attended,
                absent: stats.makeup.absent_P + stats.makeup.absent_K,
            },
            lessons: lessonsWithLearnData,
        };

        return NextResponse.json(
            { status: true, mes: 'Lấy dữ liệu thành công', data: formattedData },
            {
                status: 200,
                headers: { 'Access-Control-Allow-Origin': '*' }
            }
        );

    } catch (error) {
        return NextResponse.json(
            { status: false, mes: 'Đã xảy ra lỗi ở máy chủ', data: null },
            { status: 500 }
        );
    }
}

export async function OPTIONS(request) {
    return new Response(null, {
        status: 204,
        headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        },
    });
}