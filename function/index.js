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