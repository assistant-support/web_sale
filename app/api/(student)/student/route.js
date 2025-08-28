import connectDB from '@/config/connectDB'
import PostStudent from '@/models/student'
import '@/models/area'
import '@/models/course'
import '@/models/book'
import jsonRes from '@/utils/response'
import mongoose from 'mongoose';
import { Re_coursetry } from '@/data/course'
import { ProfileDefault, statusStudent } from '@/data/default'
import { uploadImageToDrive } from '@/function/drive/image'
import { reloadStudent } from '@/data/actions/reload'
import authenticate from '@/utils/authenticate'
import { getZaloUid } from '@/function/drive/appscript'

// Tạo học sinh mới
export async function POST(request) {
    await connectDB();
    try {
        const { user } = await authenticate(request);
        if (!user.role.includes('Admin') && !user.role.includes('Academic')) {
            return jsonRes(403, { status: false, mes: 'Bạn không có quyền truy cập chức năng này.' });
        }
        const formData = await request.formData();
        const avtFile = formData.get('Avt');
        let avt;
        if (avtFile?.size > 0) { avt = await uploadImageToDrive(avtFile, '1t949fB9rVSQyaZHnCboWDtuLNBjceTl-'); }
        const lastStudent = await PostStudent.findOne({ ID: /^AI\d{4}$/ }).sort({ ID: -1 }).select('ID').lean();
        const nextIdNumber = lastStudent ? parseInt(lastStudent.ID.slice(2), 10) + 1 : 1;
        const newStudent = new PostStudent({
            ID: 'AI' + String(nextIdNumber).padStart(4, '0'),
            Avt: avt,
            Name: formData.get('Name'),
            BD: formData.get('BD'),
            School: formData.get('School'),
            ParentName: formData.get('ParentName'),
            Phone: formData.get('Phone'),
            Email: formData.get('Email'),
            Address: formData.get('Address'),
            Area: formData.get('Area'),
            Profile: ProfileDefault(formData.get('Name')),
            Status: [statusStudent({})],
        });
        const savedStudent = await newStudent.save();
        let finalMessage = 'Tạo học sinh mới thành công!';
        const phone = formData.get('Phone');
        if (phone) {
            const zaloResult = await getZaloUid(phone);
            if (zaloResult.uid) {
                await PostStudent.findByIdAndUpdate(savedStudent._id, { $set: { Uid: zaloResult.uid } });
            } else {
                finalMessage = `Tạo học sinh mới thành công. Quá trình lấy uid thất bại: ${zaloResult.message}, kiểm tra lại số điện thoại liên hệ`;
            }
        }
        reloadStudent();
        return jsonRes(201, { status: true, mes: finalMessage, data: null });
    } catch (error) {
        console.error('Lỗi API [POST /api/students]:', error);
        return jsonRes(500, { status: false, mes: error.message, data: null });
    }
}

export async function PUT(request) {
    try {
        await connectDB();

        const { studentId, topicId, status, note } = await request.json();

        if (!studentId || !topicId) {
            return jsonRes(400, { success: false, message: "Thiếu ID của học sinh hoặc ID của buổi học thử." });
        }

        if (!mongoose.isValidObjectId(studentId) || !mongoose.isValidObjectId(topicId)) {
            return jsonRes(400, { success: false, message: "ID của học sinh hoặc buổi học thử không hợp lệ." });
        }

        if (status === undefined && note === undefined) {
            return jsonRes(400, { success: false, message: "Không có dữ liệu 'status' hoặc 'note' để cập nhật." });
        }

        const updateFields = {};

        if (status !== undefined) {
            if (![0, 1, 2].includes(status)) {
                return jsonRes(400, { success: false, message: "Giá trị 'status' không hợp lệ. Chỉ chấp nhận 0, 1, hoặc 2." });
            }
            updateFields["Trial.$[elem].status"] = status;
        }

        if (note !== undefined) {
            updateFields["Trial.$[elem].note"] = String(note);
        }

        const result = await PostStudent.updateOne(
            {
                _id: new mongoose.Types.ObjectId(studentId),
                "Trial.topic": new mongoose.Types.ObjectId(topicId)
            },
            { $set: updateFields },
            {
                arrayFilters: [{ "elem.topic": new mongoose.Types.ObjectId(topicId) }]
            }
        );

        if (result.matchedCount === 0) {
            return jsonRes(404, { success: false, message: "Không tìm thấy học sinh với buổi học thử tương ứng." });
        }

        if (result.modifiedCount === 0) {
            return jsonRes(200, { success: true, message: "Dữ liệu không có thay đổi." });
        }
        Re_coursetry()
        return jsonRes(200, { success: true, message: "Cập nhật thông tin chăm sóc thành công." });

    } catch (error) {
        console.error('API Error [PUT /api/student/care]:', error);
        return jsonRes(500, { success: false, message: 'Lỗi máy chủ.', error: error.message });
    }
}