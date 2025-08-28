import { NextResponse } from 'next/server';
import PostStudent from '@/models/student';
import connectToDB from '@/config/connectDB';
import { senMesByPhone } from '@/function/drive/appscript';

const SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbxPF49FIUFKMoGshlLpERTLx1tuW3txICdlrBGUyomMYWhgANSwY0oTNV_Eppqmo5Mruw/exec';

export async function POST(request) {
    let body;

    try {
        body = await request.json();
    } catch (error) {
        return NextResponse.json({ message: 'Lỗi: Body không phải là JSON hợp lệ.' }, { status: 400 });
    }

    const { mes, id } = body;

    if (!id || !mes) {
        return NextResponse.json(
            { message: 'Vui lòng cung cấp đủ ID học sinh và nội dung tin nhắn (mes).' },
            { status: 400 }
        );
    }

    try {
        await connectToDB();
        const student = await PostStudent.findOne({ ID: id }).lean();
        if (!student) {
            return NextResponse.json(
                { message: 'Không tìm thấy học sinh với ID này.' },
                { status: 404 }
            );
        }

        if (!student.Uid && !student.Phone) {
            return NextResponse.json(
                { message: 'Dữ liệu không hợp lệ: Học sinh này không có Uid hoặc Số điện thoại để gửi tin.' },
                { status: 400 }
            );
        }

        let personalizedMessage = mes;

        if (personalizedMessage.includes('{namestudent}')) {
            personalizedMessage = personalizedMessage.replaceAll('{namestudent}', student.Name || '');
        }

        if (personalizedMessage.includes('{nameparents}')) {
            personalizedMessage = personalizedMessage.replaceAll('{nameparents}', student.ParentName || '');
        }

        const response = await senMesByPhone({
            uid: student.Uid,
            phone: student.Phone,
            message: personalizedMessage
        });

        if (response.status === 2) {
            if (!student.Uid && student.Phone && response.data?.uid) {
                await PostStudent.updateOne(
                    { ID: id },
                    { $set: { Uid: response.data.uid } }
                );
            }

            return NextResponse.json({
                status: 2,
                message: response.mes || 'Gửi tin nhắn thành công',
                data: response.data,
            }, { status: 200 });

        } else {
            throw new Error(response.mes || 'Google Script xử lý thất bại.');
        }

    } catch (error) {
        return NextResponse.json(
            {
                status: 1,
                message: error.message,
                data: null
            },
            { status: 500 }
        );
    }
}