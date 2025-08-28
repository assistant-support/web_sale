export function formatDate(date) {
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
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