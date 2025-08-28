import { GoogleGenerativeAI } from '@google/generative-ai'
import authenticate from '@/utils/authenticate';
import jsonRes from '@/utils/response';
import student from '@/models/student';
import { senMesByPhone } from '@/function/drive/appscript';

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
            Với vai trò là giáo viên nhận xét học sinh. Dựa trên danh sách các nhận xét rời rạc sau đây về một học sinh trong suốt khóa học, hãy viết một đoạn văn tổng kết dài (khoảng 70 chữ) về thái độ và kết quả học tập của học sinh này. Chỉ trả về đoạn văn, không thêm bất kỳ lời dẫn nào.
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

export async function POST(request) {
    const { user, body } = await authenticate(request);
    const summary = await generateSummaryComment(body.comments);
    return jsonRes(200, { status: true, data: summary });
}

export async function PATCH(request) {
    const { user, body } = await authenticate(request);
    const { _id, cmt } = body;
    if (!_id || !cmt) {
        return jsonRes(400, { status: false, message: "Thiếu thông tin cần thiết" });
    }
    let studentone = await student.findOne({ _id });
    if (studentone.Uid) {
        let sen = await senMesByPhone({ message: cmt, uid: studentone.Uid });
    } else {
        let sen = await senMesByPhone({ message: cmt, phone: studentone.Phone });
        await student.findByIdAndUpdate(_id, { $set: { Uid: sen.data } });
        if (!studentone.Phone) {
            return jsonRes(404, { status: false, message: "Học sinh không có số điện thoại" });
        }
    }
    return jsonRes(200, { status: true, message: "Cập nhật thành công" });
}