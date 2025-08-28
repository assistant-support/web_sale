import connectDB from '@/config/connectDB';
import PostStudent from '@/models/student';
import PostCourse from '@/models/course';
import { NextResponse } from 'next/server';
import mongoose from 'mongoose';
import '@/models/book'
import authenticate from '@/utils/authenticate';
import jsonRes from '@/utils/response';
import { uploadImageToDrive, deleteImageFromDrive } from '@/function/drive/image';
import { getZaloUid } from '@/function/drive/appscript';
import { reloadStudent } from '@/data/actions/reload';
import { course_data, student_data } from '@/data/actions/get';

async function getTeacherList(fullCourse) {
    let teacher = [];
    for (const c of fullCourse) {
        let t = await course_data(c._id);
        teacher.push(t.TeacherHR._id);
    }
    return teacher;
}

// Cập nhập thông tin học sinh
export async function PUT(request, { params }) {
    const { id } = await params;
    if (!id) { return jsonRes(400, { status: false, mes: 'Thiếu ID học sinh' }); }
    let newUploadedFileId = null;
    try {
        const { user } = await authenticate(request);
        const student = await student_data(id);
        let fullCourse = student.Course.filter(c => c.enrollmentStatus === 0);
        let teacher = await getTeacherList(fullCourse)
        if (!user.role.includes('Admin') &&
            !user.role.includes('Academic') &&
            !teacher.includes(user.id)) {
            return jsonRes(403, { status: false, mes: 'Bạn không có quyền truy cập chức năng này.' });
        }
        await connectDB();
        const formData = await request.formData();
        const updateData = {};
        let finalMessage = 'Cập nhật thông tin thành công!';

        const existingStudent = await PostStudent.findById(id).lean();
        if (!existingStudent) {
            return jsonRes(404, { status: false, mes: 'Không tìm thấy học sinh' });
        }

        const avtFile = formData.get('Avt');
        if (avtFile && typeof avtFile !== 'string' && avtFile.size > 0) {
            newUploadedFileId = await uploadImageToDrive(avtFile, '1t949fB9rVSQyaZHnCboWDtuLNBjceTl-');
            if (newUploadedFileId) {
                updateData.Avt = newUploadedFileId;
            } else {
                throw new Error("Tải ảnh đại diện lên Google Drive thất bại.");
            }
        }

        const fields = ['Name', 'BD', 'School', 'ParentName', 'Email', 'Address', 'Area'];
        fields.forEach(field => {
            if (formData.has(field)) {
                updateData[field] = formData.get(field);
            }
        });

        const newPhone = formData.get('Phone');
        if (newPhone && newPhone !== existingStudent.Phone) {
            updateData.Phone = newPhone;
            const zaloResult = await getZaloUid(newPhone);
            if (zaloResult.uid) {
                updateData.Uid = zaloResult.uid;
            } else {
                finalMessage = `Cập nhật thông tin thành công. ${zaloResult.message}`;
            }
        }
        if (Object.keys(updateData).length === 0) {
            return jsonRes(200, { status: true, mes: 'Không có thông tin nào được thay đổi.', data: null })
        }
        await PostStudent.findByIdAndUpdate(id, { $set: updateData });
        if (newUploadedFileId && existingStudent.Avt) { await deleteImageFromDrive(existingStudent.Avt) }
        reloadStudent(id);
        return jsonRes(200, { status: true, mes: finalMessage, data: null });
    } catch (error) {
        if (newUploadedFileId) { await deleteImageFromDrive(newUploadedFileId) }
        return jsonRes(500, { status: false, mes: error.message, data: null })
    }
}

// Báo nghỉ học sinh - bảo lưu tất cả kết quả học tập hiện tại
export async function DELETE(request, { params }) {
    const { id } = params;
    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
        return jsonRes(400, { status: false, mes: 'ID học sinh không hợp lệ' });
    }
    try {
        const { user, body } = await authenticate(request);
        if (!user.role.includes('Admin') && !user.role.includes('Academic') && !user.role.includes('Sales')) {
            return jsonRes(403, { status: false, mes: 'Bạn không có quyền truy cập chức năng này.' });
        }
        const { mes } = body;
        if (!mes) {
            return jsonRes(400, { status: false, mes: 'Cần cung cấp lý do báo nghỉ' });
        }
        await connectDB();
        const student = await PostStudent.findById(id);
        if (!student) {
            return jsonRes(404, { status: false, mes: 'Không tìm thấy học sinh' });
        }
        if (student.Leave) {
            return jsonRes(400, { status: false, mes: 'Học sinh này đã được báo nghỉ trước đó' });
        }
        if (student.Type) {
            const courseIds = student.Course.map(c => c.course);
            await PostCourse.updateMany(
                { _id: { $in: courseIds }, Status: false, 'Student.ID': student.ID },
                { $pull: { 'Student.$.Learn': { Checkin: 0 } } }
            );
        }
        await PostStudent.findByIdAndUpdate(id, {
            $set: { Leave: true },
            $push: { Status: { status: 'leave', date: new Date(), note: mes } }
        });
        reloadStudent(id);
        return jsonRes(200, { status: true, mes: 'Đã cập nhật trạng thái nghỉ học cho học sinh thành công', data: null });
    } catch (error) {
        console.error("Lỗi khi xử lý báo nghỉ cho học sinh:", error);
        return jsonRes(500, { status: false, mes: error.message, data: null });
    }
}


