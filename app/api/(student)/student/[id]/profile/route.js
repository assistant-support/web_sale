import { NextResponse } from 'next/server';
import connectDB from '@/config/connectDB';
import PostStudent from '@/models/student';
import { Re_Student_All, Re_Student_ById } from '@/data/database/student';
import '@/models/course'
import '@/models/book';
import { reloadStudent } from '@/data/actions/reload';
import authenticate from '@/utils/authenticate';

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, PUT, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export async function OPTIONS(request) {
    return new NextResponse(null, { headers: corsHeaders });
}

// Lấy thông tin hồ sơ điện tử học sinh
export async function GET(request, { params }) {
    const { id } = await params;

    try {
        await connectDB();
        const student = await PostStudent.findById(id).populate({
            path: 'Course.course',
            model: 'course',
            populate: {
                path: 'Book',
                model: 'book',
                select: 'Name ID Image'
            },
            select: 'ID Book'
        }).lean();

        if (!student) {
            return NextResponse.json(
                { status: false, mes: 'Không tìm thấy học sinh.', data: null },
                { status: 404, headers: corsHeaders }
            );
        }

        const defaultProfile = {
            Intro: "",
            Avatar: "",
            ImgSkill: "",
            ImgPJ: [],
            Skill: {
                "Sự tiến bộ và Phát triển": "0",
                "Kỹ năng giao tiếp": "0",
                "Diễn giải vấn đề": "0",
                "Tự tin năng động": "0",
                "Đổi mới sáng tạo": "0",
                "Giao lưu hợp tác": "0"
            },
            Present: []
        };

        const mergedProfile = { ...defaultProfile, ...(student.Profile || {}) };

        const existingPresentations = new Map(
            mergedProfile.Present.map(p => [p.bookId, p])
        );
        if (!student.Course || !Array.isArray(student.Course)) {
            student.Course = [];
        }

        const finalPresent = student.Course.map(courseItem => {
            const bookInfo = courseItem.course?.Book;

            if (!bookInfo || !bookInfo.ID) {
                return null;
            }

            const existingData = existingPresentations.get(bookInfo.ID) || {};

            return {
                bookId: bookInfo.ID,
                bookName: bookInfo.Name || "",
                Video: existingData.Video || "",
                Img: existingData.Img || "",
                Comment: existingData.Comment || ""
            };
        }).filter(Boolean);

        const responseData = {
            profile: {
                ...mergedProfile,
                Present: finalPresent
            },
            name: student.Name,
            id: student.ID,
            course: student.Course || []
        };

        return NextResponse.json(
            { status: true, mes: 'Lấy dữ liệu thành công.', data: responseData },
            { status: 200, headers: corsHeaders }
        );

    } catch (error) {
        console.log(error);

        return NextResponse.json(
            { status: false, mes: error.message, data: null },
            { status: 500, headers: corsHeaders }
        );
    }
}

// Cập nhập thông tin hồ sơ điện tử học sinh
export async function PUT(request, { params }) {
    const { id } = await params;

    try {
        const { user, body } = await authenticate(request);
        if (!body || Object.keys(body).length === 0) {
            return NextResponse.json(
                { status: false, mes: 'Dữ liệu profile không được để trống.', data: null },
                { status: 400, headers: corsHeaders }
            );
        }

        await connectDB();
        const updated = await PostStudent.findByIdAndUpdate(
            id,
            { Profile: body },
            { new: true, runValidators: true }
        );

        if (!updated) {
            return NextResponse.json(
                { status: false, mes: 'Cập nhật thất bại, không tìm thấy học sinh.', data: null },
                { status: 404, headers: corsHeaders }
            );
        }
        reloadStudent(id);
        return NextResponse.json(
            { status: true, mes: 'Cập nhật hồ sơ thành công.', data: null },
            { status: 200, headers: corsHeaders }
        );
    } catch (error) {
        return NextResponse.json(
            { status: false, mes: error.message, data: null },
            { status: error.name === 'ValidationError' ? 400 : 500, headers: corsHeaders }
        );
    }
}