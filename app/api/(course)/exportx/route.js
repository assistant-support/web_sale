import { formatDate } from '@/function';
import ExcelJS from 'exceljs';

export const runtime = 'nodejs';

/* -------- helpers -------- */
function toAscii(str = '') {
    return str
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-zA-Z0-9_.-]+/g, '_');
}

function jsonRes(obj, status = 200) {
    return new Response(JSON.stringify(obj), {
        status,
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
    });
}

/* -------- POST /api/export-excel -------- */
export async function POST(request) {
    try {
        const body = await request.json();
        const { lessons = [], teacherHR, course = '', student, summaryStats, date } = body;

        if (!lessons.length)
            return jsonRes({ status: 0, mes: 'Thiếu lessons' }, 400);

        const wb = new ExcelJS.Workbook();
        const ws = wb.addWorksheet('Report');
        let title = `Báo cáo học tập - ${student.Name} - ${course.ID}`;
        ws.addRow(['Mã khóa học:', course.ID, 'Mã học sinh:', student.ID, "", 'Lịch học', '', 'Lịch học bù', '', 'Trạng thái học bù']);
        ws.addRow(['Tên chương trình:', course.Book.Name, 'Tên học sinh:', student.Name, '', 'Tổng buổi:', summaryStats.official.total, 'Số chủ đề bù:', summaryStats.makeupNeeded.count, 'Số buổi bù:', summaryStats.makeupTaken.total]);
        ws.addRow(['Thời gian học', `${date[0]} - ${date[1]}`, 'Phụ huynh:', student.ParentName, '', 'Đã học:', summaryStats.official.attended, '', '', 'Đã học bù:', summaryStats.makeupTaken.attended]);
        ws.addRow(['Giáo viên chủ nhiệm:', course.TeacherHR.name, 'Liên Hệ', student.Phone, '', 'Vắng có phép:', summaryStats.official.excused, '', '', 'Vắng học bù:', summaryStats.makeupTaken.missed]);
        ws.addRow(['Số điện thoại giáo viên chủ nhiệm', course.TeacherHR.phone, '', '', '', 'Vắng không phép:', summaryStats.official.unexcused]);
        ws.addRow([''])

        const header = [
            'Buổi học',
            'Tên bài học',
            'Tên giáo viên dạy',
            'Trạng thái lớp học',
            'Ngày học',
            'Giờ học',
            'Trạng thái điểm danh',
            'Nhận xét của giáo viên',
        ];
        ws.addRow(header);

        lessons.forEach((l, idx) => {
            ws.addRow([
                l.Index ?? idx + 1,
                l.Topic.Name,
                l.Teacher.name,
                l.Status,
                formatDate(new Date(l.Day)),
                l.Time,
                l.Attendance,
                l.Comments ?? '',
            ]);
        });

        /* 4. Auto-width đơn giản */
        ws.columns.forEach(col => {
            let max = 12;
            col.eachCell(c => { max = Math.max(max, String(c.value).length); });
            col.width = max + 2;
        });

        /* 5. Xuất buffer Excel */
        const uint8 = await wb.xlsx.writeBuffer();
        const buf = Buffer.from(uint8);

        const asciiName = `${toAscii(title)}.xlsx`;
        const utfName = encodeURIComponent(`${title}.xlsx`);

        return new Response(buf, {
            status: 200,
            headers: {
                'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                'Content-Disposition': `attachment; filename="${asciiName}"; filename*=UTF-8''${utfName}`,
            },
        });
    } catch (err) {
        console.error(err);
        return jsonRes({ status: 0, mes: `Lỗi: ${err.message}` }, 500);
    }
}
export async function PUT(request) {
    try {
        const body = await request.json();
        const { students, courseId, courseName } = body;

        if (!students || !students.length) {
            return jsonRes({ status: 0, mes: 'Thiếu danh sách học sinh (students)' }, 400);
        }

        const wb = new ExcelJS.Workbook();
        const ws = wb.addWorksheet('Danh sach hoc sinh');

        // Tạo tiêu đề cho file
        const title = `Danh_sach_hoc_sinh_khoa_${courseId}`;

        // Định nghĩa các cột
        ws.columns = [
            { header: 'STT', key: 'stt', width: 5 },
            { header: 'ID', key: 'id', width: 15 },
            { header: 'Name', key: 'name', width: 30 },
            { header: 'Mã khóa học', key: 'courseId', width: 20 },
            { header: 'Tên khóa học', key: 'courseName', width: 40 },
            { header: 'Trạng thái học phí', key: 'feeStatus', width: 25 },
            { header: 'ePortfolio', key: 'eport', width: 50 },
        ];

        // Thêm dữ liệu học sinh
        students.forEach(student => {
            ws.addRow({
                ...student,
                eport: {
                    text: 'Xem hồ sơ',
                    hyperlink: student.eport
                }
            });
        });

        // Định dạng hyperlink
        ws.getColumn('eport').eachCell({ includeEmpty: false }, (cell) => {
            cell.font = { color: { argb: 'FF0000FF' }, underline: true };
        });


        // Xuất buffer Excel
        const uint8 = await wb.xlsx.writeBuffer();
        const buf = Buffer.from(uint8);

        const asciiName = `${toAscii(title)}.xlsx`;
        const utfName = encodeURIComponent(`${title}.xlsx`);

        return new Response(buf, {
            status: 200,
            headers: {
                'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                'Content-Disposition': `attachment; filename="${asciiName}"; filename*=UTF-8''${utfName}`,
            },
        });
    } catch (err) {
        console.error(err);
        return jsonRes({ status: 0, mes: `Lỗi: ${err.message}` }, 500);
    }
}