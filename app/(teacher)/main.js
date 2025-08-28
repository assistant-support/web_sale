'use client';
import React, { useState, useMemo } from 'react';
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend } from 'chart.js';
import { Bar } from 'react-chartjs-2';
import styles from './index.module.css';
import Menu from '@/components/(ui)/(button)/menu';
import Link from 'next/link';

// === Các hàm tiện ích ===
const getWeekRange = (date) => {
    const d = new Date(date);
    const day = d.getDay();
    const diffToMonday = d.getDate() - day + (day === 0 ? -6 : 1);
    const startDate = new Date(d.setDate(diffToMonday));
    startDate.setHours(0, 0, 0, 0);
    const endDate = new Date(startDate);
    endDate.setDate(startDate.getDate() + 6);
    endDate.setHours(23, 59, 59, 999);
    return { startDate, endDate };
};

const getWeekNumber = (d) => {
    d = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
    return weekNo;
};
// =========================

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend);

export default function TeacherDashboard({ currentUser: currentUserArray, courses }) {
    const currentUser = currentUserArray?.[0];
    console.log(currentUser);
    
    // State quản lý bộ lọc
    const [timeGranularity, setTimeGranularity] = useState('month');
    const [selectedDate, setSelectedDate] = useState(new Date());

    // State quản lý việc mở/đóng các menu
    const [isGranularityMenuOpen, setIsGranularityMenuOpen] = useState(false);
    const [isYearMenuOpen, setIsYearMenuOpen] = useState(false);
    const [isMonthMenuOpen, setIsMonthMenuOpen] = useState(false);
    const [isQuarterMenuOpen, setIsQuarterMenuOpen] = useState(false);
    const [isWeekMenuOpen, setIsWeekMenuOpen] = useState(false);

    // Tính toán khoảng thời gian bắt đầu/kết thúc dựa trên bộ lọc
    const { startDate, endDate } = useMemo(() => {
        const d = new Date(selectedDate);
        if (timeGranularity === 'year') {
            const year = d.getFullYear();
            return { startDate: new Date(year, 0, 1), endDate: new Date(year, 11, 31, 23, 59, 59, 999) };
        }
        if (timeGranularity === 'quarter') {
            const year = d.getFullYear();
            const quarter = Math.floor(d.getMonth() / 3);
            const startMonth = quarter * 3;
            return { startDate: new Date(year, startMonth, 1), endDate: new Date(year, startMonth + 3, 0, 23, 59, 59, 999) };
        }
        if (timeGranularity === 'week') return getWeekRange(d);
        // Mặc định là 'month'
        const year = d.getFullYear();
        const month = d.getMonth();
        return { startDate: new Date(year, month, 1), endDate: new Date(year, month + 1, 0, 23, 59, 59, 999) };
    }, [timeGranularity, selectedDate]);

    // Xử lý, tổng hợp dữ liệu cho cá nhân giáo viên
    const personalStats = useMemo(() => {
        if (!currentUser || !courses) return null;

        const now = new Date();
        let teachingSessions = [];
        let taSessions = [];
        let homeroomClasses = new Set();
        let upcomingClasses = [];
        let violations = { attendance: 0, comment: 0, evidence: 0 };
        const teacherId = currentUser._id;

        courses.forEach(course => {
            if (course.TeacherHR?._id === teacherId) {
                homeroomClasses.add(course);
            }
            if (!course.Detail) return;
            course.Detail.forEach(lesson => {
                const isTeacher = lesson.Teacher?._id === teacherId;
                const isTA = lesson.TeachingAs?._id === teacherId;
                if (!isTeacher && !isTA) return;

                const lessonDate = new Date(lesson.Day);
                if (lessonDate > now) {
                    upcomingClasses.push({ ...lesson, courseName: course.Name || course.ID });
                }

                if (lessonDate >= startDate && lessonDate <= endDate && lessonDate <= now) {
                    const sessionData = { ...lesson, courseName: course.Name || course.ID, date: lessonDate };
                    if (isTeacher) teachingSessions.push(sessionData);
                    if (isTA) taSessions.push(sessionData);

                    if (isTeacher) {
                        let attendanceViolated = false, commentViolated = false, evidenceViolated = false;
                        if (course.Student) {
                            course.Student.forEach(student => {
                                const learnRecord = student.Learn?.find(lr => lr.Lesson === lesson._id);
                                if (!learnRecord) return;
                                if (learnRecord.Checkin === 0) attendanceViolated = true;
                                if (learnRecord.Checkin === 1) {
                                    if (learnRecord.Cmt?.length === 0) commentViolated = true;
                                    if (learnRecord.Image?.length === 0) evidenceViolated = true;
                                }
                            });
                        }
                        if (attendanceViolated) violations.attendance++;
                        if (commentViolated) violations.comment++;
                        if (evidenceViolated) violations.evidence++;
                    }
                }
            });
        });

        return {
            teachingSessions, taSessions,
            totalWorkload: teachingSessions.length + taSessions.length,
            homeroomClasses: Array.from(homeroomClasses),
            upcomingClasses: upcomingClasses.sort((a, b) => new Date(a.Day) - new Date(b.Day)),
            violations: { ...violations, total: violations.attendance + violations.comment + violations.evidence }
        };
    }, [currentUser, courses, startDate, endDate]);

    // Dữ liệu cho biểu đồ khối lượng công việc
    const chartData = useMemo(() => {
        if (!personalStats) return { labels: [], datasets: [] };

        const labels = [];
        const teachingData = [];
        const taData = [];

        if (timeGranularity === 'month') {
            const daysInMonth = new Date(selectedDate.getFullYear(), selectedDate.getMonth() + 1, 0).getDate();
            for (let i = 1; i <= daysInMonth; i++) {
                labels.push(i.toString());
                teachingData.push(0);
                taData.push(0);
            }
            personalStats.teachingSessions.forEach(s => teachingData[s.date.getDate() - 1]++);
            personalStats.taSessions.forEach(s => taData[s.date.getDate() - 1]++);
        } else { // 'week' hoặc các trường hợp khác có thể được thêm vào sau
            const weekDays = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];
            labels.push(...weekDays);
            for (let i = 0; i < 7; i++) { teachingData.push(0); taData.push(0); }
            personalStats.teachingSessions.forEach(s => { const dayIndex = (s.date.getDay() + 6) % 7; teachingData[dayIndex]++; });
            personalStats.taSessions.forEach(s => { const dayIndex = (s.date.getDay() + 6) % 7; taData[dayIndex]++; });
        }

        return {
            labels,
            datasets: [
                { label: 'Buổi dạy', data: teachingData, backgroundColor: '#36a2eb' },
                { label: 'Buổi trợ giảng', data: taData, backgroundColor: '#ff9f40' }
            ]
        };
    }, [personalStats, timeGranularity, selectedDate]);

    const chartOptions = {
        responsive: true, maintainAspectRatio: false,
        scales: { x: { stacked: true }, y: { stacked: true, beginAtZero: true, ticks: { stepSize: 1 } } },
        plugins: { legend: { position: 'top' } }
    };

    // Hàm render bộ lọc thời gian chi tiết
    const renderTimePeriodSelector = () => {
        const currentYear = new Date().getFullYear();
        const year = selectedDate.getFullYear();
        const month = selectedDate.getMonth();
        const quarter = Math.floor(month / 3);
        const yearOptions = Array.from({ length: 5 }, (_, i) => currentYear - i);

        switch (timeGranularity) {
            case 'week':
                const weekDetails = getWeekRange(selectedDate);
                const weekButtonText = `Tuần ${getWeekNumber(selectedDate)} (${weekDetails.startDate.toLocaleDateString('vi-VN')} - ${weekDetails.endDate.toLocaleDateString('vi-VN')})`;
                return (
                    <div className={styles.timePeriodGroup}>
                        <Menu isOpen={isWeekMenuOpen} onOpenChange={setIsWeekMenuOpen} customButton={<div className='input text_6_400'>{weekButtonText}</div>} menuItems={
                            <div className={styles.datePickerWrapper}>
                                <input type="date" className={styles.datePickerInput} value={selectedDate.toISOString().split('T')[0]} onChange={e => { setSelectedDate(new Date(e.target.value)); setIsWeekMenuOpen(false); }} />
                            </div>}
                        />
                    </div>
                );
            // Các case 'month', 'quarter', 'year' tương tự...
            case 'month':
                return (
                    <div className={styles.timePeriodGroup}>
                        <Menu isOpen={isMonthMenuOpen} onOpenChange={setIsMonthMenuOpen} customButton={<div className='input text_6_400'>{`Tháng ${month + 1}`}</div>} menuItems={<div className={styles.menulist}>{Array.from({ length: 12 }, (_, i) => i).map(m => <p key={m} className='text_6_400' onClick={() => { setSelectedDate(new Date(year, m, 1)); setIsMonthMenuOpen(false); }}>{`Tháng ${m + 1}`}</p>)}</div>} />
                        <Menu isOpen={isYearMenuOpen} onOpenChange={setIsYearMenuOpen} customButton={<div className='input text_6_400'>{`Năm ${year}`}</div>} menuItems={<div className={styles.menulist}>{yearOptions.map(y => <p key={y} className='text_6_400' onClick={() => { setSelectedDate(new Date(y, month, 1)); setIsYearMenuOpen(false); }}>{`Năm ${y}`}</p>)}</div>} />
                    </div>
                );
            case 'quarter':
                return (
                    <div className={styles.timePeriodGroup}>
                        <Menu isOpen={isQuarterMenuOpen} onOpenChange={setIsQuarterMenuOpen} customButton={<div className='input text_6_400'>{`Quý ${quarter + 1}`}</div>} menuItems={<div className={styles.menulist}>{[0, 1, 2, 3].map(q => <p key={q} className='text_6_400' onClick={() => { setSelectedDate(new Date(year, q * 3, 1)); setIsQuarterMenuOpen(false); }}>{`Quý ${q + 1}`}</p>)}</div>} />
                        <Menu isOpen={isYearMenuOpen} onOpenChange={setIsYearMenuOpen} customButton={<div className='input text_6_400'>{`Năm ${year}`}</div>} menuItems={<div className={styles.menulist}>{yearOptions.map(y => <p key={y} className='text_6_400' onClick={() => { setSelectedDate(new Date(y, quarter * 3, 1)); setIsYearMenuOpen(false); }}>{`Năm ${y}`}</p>)}</div>} />
                    </div>
                );
            case 'year':
                return (
                    <div className={styles.timePeriodGroup}>
                        <Menu isOpen={isYearMenuOpen} onOpenChange={setIsYearMenuOpen} customButton={<div className='input text_6_400'>{`Năm ${year}`}</div>} menuItems={<div className={styles.menulist}>{yearOptions.map(y => <p key={y} className='text_6_400' onClick={() => { setSelectedDate(new Date(y, 0, 1)); setIsYearMenuOpen(false); }}>{`Năm ${y}`}</p>)}</div>} />
                    </div>
                );
            default: return null;
        }
    };

    if (!personalStats) return <div>Đang tải hoặc không có dữ liệu...</div>;

    const granularityText = { week: 'Xem theo tuần', month: 'Xem theo tháng', quarter: 'Xem theo quý', year: 'Xem theo năm' };

    return (
        <div className={styles.container}>
            <div className={styles.sidebar}>
                <p className='text_4'>Bảng điều khiển</p>
                <p className='text_6_400' style={{ marginTop: '-5px', marginBottom: '10px' }}>Xin chào, {currentUser.name}!</p>

                <div className={styles.filters}>
                    <div className={styles.filterGroup}>
                        <Menu isOpen={isGranularityMenuOpen} onOpenChange={setIsGranularityMenuOpen} customButton={<div className='input text_6_400'>{granularityText[timeGranularity]}</div>} menuItems={
                            <div className={styles.menulist}>
                                {Object.entries(granularityText).map(([key, value]) => (
                                    <p key={key} className='text_6_400' onClick={() => { setTimeGranularity(key); setIsGranularityMenuOpen(false); }}>{value}</p>
                                ))}
                            </div>}
                        />
                    </div>
                </div>
                <div>{renderTimePeriodSelector()}</div>

                <div className={styles.kpiGrid}>
                    <div className={styles.kpiCard}><span>Tổng buổi dạy</span><strong>{personalStats.totalWorkload}</strong></div>
                    <div className={styles.kpiCard}><span>Lớp chủ nhiệm</span><strong>{personalStats.homeroomClasses.length}</strong></div>
                    <div className={styles.kpiCard}><span>Tổng vi phạm</span><strong className={styles.violations}>{personalStats.violations.total}</strong></div>
                </div>

                <div className={styles.leaderboard}>
                    <p className='text_6' style={{ paddingBottom: 8, marginBottom: 3, borderBottom: 'thin dashed var(--border-color)' }}>Lịch dạy sắp tới</p>
                    {personalStats.upcomingClasses.length > 0 ? personalStats.upcomingClasses.slice(0, 5).map((lesson, i) =>
                        <div key={i} className={styles.leaderboardItem}>
                            <span>{lesson.courseName}</span>
                            <strong>{new Date(lesson.Day).toLocaleDateString('vi-VN')}</strong>
                        </div>
                    ) : <p className={styles.noData}>Không có lịch dạy mới.</p>}
                </div>

                <div className={styles.leaderboard}>
                    <p className='text_6' style={{ paddingBottom: 8, marginBottom: 3, borderBottom: 'thin dashed var(--border-color)' }}>Các lớp đang chủ nhiệm</p>
                    {personalStats.homeroomClasses.length > 0 ? personalStats.homeroomClasses.map((course, i) =>
                        <Link href={`/course/${course._id}`} key={i} className={styles.leaderboardItem}>
                            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                                <p className='text_6'>{course.Name || course.ID}</p>
                                <p className='text_7_400' style={{ color: 'white', padding: '3px 8px', borderRadius: 5, background: course.Status ? 'var(--green)' : 'var(--yellow)' }}>{course.Status ? 'Đã hoàn thành' : 'Đang học'}</p>
                            </div>
                            <p className='text_6_400'>{course.Student?.length || 0} Học viên</p>
                        </Link>
                    ) : <p className={styles.noData}>Bạn chưa chủ nhiệm lớp nào.</p>}
                </div>
            </div>

            <div className={styles.mainContent}>
                <p className='text_5'>Thống kê khối lượng công việc</p>
                <div className={styles.chartWrapper}>
                    <Bar data={chartData} options={chartOptions} />
                </div>
            </div>
        </div>
    );
}