export function formatDate(date) {
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    if (day == 'NaN' || month == 'NaN' || year == 'NaN') return 'Thiếu thông tin'
    return `${day}/${month}/${year}`;
}
export function countStudentsWithLesson(lessonId, data) {
    let count = 0;

    for (const student of data) {
        const hasLesson = student.Learn.some(entry => entry.Lesson === lessonId);
        if (hasLesson) {
            count++;
        }
    }

    return count;
}

export function calculatePastLessons(courseData) {
    let pastLessonsCount = 0;
    const currentDate = new Date();
    currentDate.setHours(0, 0, 0, 0);

    courseData.Detail.forEach(lesson => {
        const lessonDate = new Date(lesson.Day);
        lessonDate.setHours(0, 0, 0, 0);

        if (lessonDate < currentDate) {
            pastLessonsCount++;
        }
    });

    return pastLessonsCount;
}

export function srcImage(id) {
    return `https://lh3.googleusercontent.com/d/${id}`
}

export function formatCurrencyVN(number) {
    if (typeof number !== 'number' || isNaN(number)) {
        return '0 VNĐ';
    }
    const formattedNumber = number.toLocaleString('vi-VN');
    return `${formattedNumber} VNĐ`;
}

export const truncateString = (str, start, end) => !str ? "" : str.length > start + end ? `${str.slice(0, start)}...${str.slice(-end)}` : str;
export const driveImage = (id) => {
    if (!id) return null;
    if (id.startsWith('https://lh3.googleusercontent.com/d/')) return id;
    return `https://lh3.googleusercontent.com/d/${id}`;
}


export function formatDelay(ms) {
    if (typeof ms !== 'number' || ms < 0) return 'Thời gian không hợp lệ';
    const min = ms / 60000;
    if (min === 0) return '0 phút';
    if (min >= 1440) return (min / 1440).toFixed(1) + ' ngày'; // .toFixed(1) cho đẹp hơn
    if (min >= 60) return (min / 60).toFixed(1) + ' giờ'; // .toFixed(1) cho đẹp hơn
    return min.toFixed(0) + ' phút';
}

// Chuyển status code thành text
const statusMap = {
    // ... (nội dung giống hệt ở trên) ...
    'new_unconfirmed_1': 'Mới, chưa xác nhận',
    'missing_info_1': 'Thiếu thông tin',
    'not_valid_1': 'Không hợp lệ',
    'duplicate_merged_1': 'Trùng lặp (đã gộp)',
    'rejected_immediate_1': 'Từ chối ngay',
    'valid_1': 'Hợp lệ (chờ xử lý)',
    'msg_success_2': 'Gửi tin nhắn thành công',
    'msg_error_2': 'Gửi tin nhắn thất bại',
    'noikhoa_3': 'Đã phân bổ: nội khoa',
    'ngoaikhoa_3': 'Đã phân bổ: ngoại khoa',
    'undetermined_3': 'Chưa phân bổ',
    'consulted_pending_4': 'Đã tư vấn, chờ quyết định',
    'scheduled_unconfirmed_4': 'Đã lên lịch, chưa xác nhận',
    'callback_4': 'Yêu cầu gọi lại',
    'not_interested_4': 'Không quan tâm',
    'no_contact_4': 'Không liên lạc được',
    'confirmed_5': 'Lịch hẹn đã xác nhận',
    'postponed_5': 'Lịch hẹn đã hoãn',
    'canceled_5': 'Lịch hẹn đã hủy',
    'serviced_completed_6': 'Dịch vụ đã hoàn thành',
    'serviced_in_progress_6': 'Dịch vụ đang thực hiện',
    'rejected_after_consult_6': 'Từ chối sau tư vấn'
};

export function getStatusInVietnamese(statusKey, defaultValue = 'Trạng thái không xác định') {
    return statusMap[statusKey] || defaultValue;
}

export function maskPhoneNumber(phone) {
    if (!phone || typeof phone !== 'string' || phone.length < 10) {
        // Trả về số điện thoại gốc nếu nó quá ngắn để che
        return phone || '';
    }
    const prefix = phone.slice(0, 2);
    const suffix = phone.slice(-2);
    const mask = 'xxxxxx';
    return `${prefix}${mask}${suffix}`;
}