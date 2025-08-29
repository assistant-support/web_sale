'use client';

import { useState, useMemo } from 'react';
import { Bar, Doughnut } from 'react-chartjs-2';
import {
    Chart as ChartJS,
    CategoryScale,
    LinearScale,
    BarElement,
    ArcElement,
    Title,
    Tooltip,
    Legend,
} from 'chart.js';
import styles from './index.module.css';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

ChartJS.register(CategoryScale, LinearScale, BarElement, ArcElement, Title, Tooltip, Legend);


const StatusCharts = ({ summaryData, violationTypesData }) => {
    const chartOptions = {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: {
                position: 'top',
                labels: {
                    font: {
                        family: "'Inter', sans-serif",
                    }
                }
            },
            title: {
                display: true,
                font: {
                    size: 16,
                    family: "'Inter', sans-serif",
                },
                padding: {
                    top: 10,
                    bottom: 10
                }
            },
            tooltip: {
                titleFont: { family: "'Inter', sans-serif" },
                bodyFont: { family: "'Inter', sans-serif" }
            }
        },
    };

    const summaryChartData = {
        labels: [''], // Bỏ label trục X để gọn hơn
        datasets: [
            {
                label: 'Hoàn thành',
                data: [summaryData.completed],
                backgroundColor: 'rgba(75, 192, 192, 0.6)',
                borderColor: 'rgba(75, 192, 192, 1)',
                borderWidth: 1,
            },
            {
                label: 'Vi phạm',
                data: [summaryData.violations],
                backgroundColor: 'rgba(255, 99, 132, 0.6)',
                borderColor: 'rgba(255, 99, 132, 1)',
                borderWidth: 1,
            },
        ],
    };

    const violationTypesChartData = {
        labels: ['Điểm Danh', 'Nhận Xét', 'Hình Ảnh'],
        datasets: [
            {
                label: 'Số lỗi vi phạm',
                data: [
                    violationTypesData.attendance,
                    violationTypesData.comment,
                    violationTypesData.image,
                ],
                backgroundColor: [
                    'rgba(255, 159, 64, 0.7)',
                    'rgba(153, 102, 255, 0.7)',
                    'rgba(54, 162, 235, 0.7)',
                ],
                borderColor: [
                    'rgba(255, 159, 64, 1)',
                    'rgba(153, 102, 255, 1)',
                    'rgba(54, 162, 235, 1)',
                ],
                borderWidth: 1,
                hoverOffset: 8,
            },
        ],
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, height: '100%' }}>
            <div style={{ position: 'relative', height: '40%' }}>
                <Bar
                    options={{
                        ...chartOptions,
                        scales: { y: { beginAtZero: true } },
                        plugins: { ...chartOptions.plugins, title: { ...chartOptions.plugins.title, text: `Tổng quan: ${summaryData.total} buổi học` } }
                    }}
                    data={summaryChartData}
                />
            </div>
            <div style={{ position: 'relative', height: '55%', display: 'flex', justifyContent: 'center' }}>
                <Doughnut
                    options={{
                        ...chartOptions,
                        plugins: { ...chartOptions.plugins, title: { ...chartOptions.plugins.title, text: 'Phân loại vi phạm phổ biến' } }
                    }}
                    data={violationTypesChartData}
                />
            </div>
        </div>
    );
};


// ====================================================================
// CÁC THÀNH PHẦN ICON (Icon Components)
// ====================================================================
const ChevronIcon = ({ expanded, size = 20 }) => (
    <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={`${styles.toggleIcon} ${expanded ? styles.expanded : ''}`}>
        <polyline points="6 9 12 15 18 9"></polyline>
    </svg>
);

const CheckCircleIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={styles.completedIcon}>
        <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline>
    </svg>
);

// ====================================================================
// HÀM TIỆN ÍCH (Utility Function)
// ====================================================================
const getCurrentMonthDateRange = () => {
    const now = new Date();
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    const toYyyyMmDd = (date) => date.toISOString().split('T')[0];
    return { start: toYyyyMmDd(firstDay), end: toYyyyMmDd(lastDay) };
};


// ====================================================================
// THÀNH PHẦN CHÍNH (Main Component)
// ====================================================================
const EnhancedViolationsReport = ({ initialReports }) => {
    const router = useRouter();
    const [visibleTeacher, setVisibleTeacher] = useState(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [startDate, setStartDate] = useState(getCurrentMonthDateRange().start);
    const [endDate, setEndDate] = useState(getCurrentMonthDateRange().end);
    const [showMode, setShowMode] = useState('violations');
    const [isSummaryExpanded, setIsSummaryExpanded] = useState(false);

    const toggleDetails = (teacherId) => {
        setVisibleTeacher(visibleTeacher === teacherId ? null : teacherId);
    };

    // Tối ưu hóa tính toán dữ liệu
    const lessonsInDateRange = useMemo(() => {
        return (Array.isArray(initialReports) ? initialReports : [])
            .flatMap(report => report?.allLessons || [])
            .filter(lesson => {
                if (typeof lesson !== 'object' || !lesson?.lessonId) return false;
                const lessonDate = new Date(lesson.day);
                const start = startDate ? new Date(startDate) : null;
                const end = endDate ? new Date(endDate) : null;
                if (end) end.setHours(23, 59, 59, 999);
                return (!start || lessonDate >= start) && (!end || lessonDate <= end);
            });
    }, [initialReports, startDate, endDate]);

    const reportSummary = useMemo(() => {
        const violations = lessonsInDateRange.filter(l => l.isViolation).length;
        return {
            total: lessonsInDateRange.length,
            violations: violations,
            completed: lessonsInDateRange.length - violations,
        };
    }, [lessonsInDateRange]);

    const violationTypesSummary = useMemo(() => {
        const violationCounts = {
            attendance: 0,
            comment: 0,
            image: 0,
        };

        lessonsInDateRange.forEach(lesson => {
            if (lesson.isViolation && lesson.errors) {
                if (lesson.errors.attendance) violationCounts.attendance++;
                if (lesson.errors.comment) violationCounts.comment++;
                if (lesson.errors.image) violationCounts.image++;
            }
        });

        return violationCounts;
    }, [lessonsInDateRange]);


    const filteredReports = useMemo(() => {
        let reports = Array.isArray(initialReports) ? initialReports.filter(r => typeof r === 'object' && r?.teacherInfo) : [];

        if (searchTerm) {
            reports = reports.filter(r => r.teacherInfo.name.toLowerCase().includes(searchTerm.toLowerCase()));
        }

        const reportsWithFilteredLessons = reports.map(report => {
            const lessons = Array.isArray(report.allLessons) ? report.allLessons.filter(l => typeof l === 'object' && l?.lessonId) : [];

            const lessonsInScope = lessons.filter(lesson => {
                const lessonDate = new Date(lesson.day);
                const start = startDate ? new Date(startDate) : null;
                const end = endDate ? new Date(endDate) : null;
                if (end) end.setHours(23, 59, 59, 999);
                return (!start || lessonDate >= start) && (!end || lessonDate <= end);
            });

            const lessonsToDisplay = showMode === 'violations'
                ? lessonsInScope.filter(l => l.isViolation)
                : lessonsInScope;

            return {
                ...report,
                lessonsToDisplay: lessonsToDisplay,
                violationsInScope: lessonsInScope.filter(l => l.isViolation).length,
                totalInScope: lessonsInScope.length,
            };
        }).filter(report => report.lessonsToDisplay.length > 0);

        reportsWithFilteredLessons.sort((a, b) => b.violationsInScope - a.violationsInScope || b.totalInScope - a.totalInScope);

        return reportsWithFilteredLessons;
    }, [initialReports, searchTerm, startDate, endDate, showMode]);

    const handleResetFilters = () => {
        const currentMonth = getCurrentMonthDateRange();
        setSearchTerm('');
        setStartDate(currentMonth.start);
        setEndDate(currentMonth.end);
        setShowMode('violations');
        router.refresh();
    };

    return (
        <div className={styles.wrapper}>
            <div className={styles.filterBar}>
                <div className={styles.filterGroup}>
                    <div className={styles.modeToggle}>
                        <button onClick={() => setShowMode('violations')} className={`${styles.modeButton} ${showMode === 'violations' ? styles.active : ''}`}>Chỉ vi phạm</button>
                        <button onClick={() => setShowMode('all')} className={`${styles.modeButton} ${showMode === 'all' ? styles.active : ''}`}>Tất cả</button>
                    </div>
                    <input type="text" placeholder="Tìm tên giáo viên..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className={`input ${styles.searchInput}`} />
                    <div className={styles.dateFilters}>
                        <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className={`input ${styles.dateInput}`} title="Từ ngày" />
                        <span className={styles.dateSeparator}>–</span>
                        <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className={`input ${styles.dateInput}`} title="Đến ngày" />
                    </div>
                </div>
                <div className={styles.filterGroup}>
                    <button onClick={handleResetFilters} className={styles.resetButton}>Làm mới</button>
                </div>
            </div>

            <div style={{ display: 'flex', gap: 16, flex: 1, overflow: 'hidden' }}>
                {/* Khu vực biểu đồ */}
                <div className={styles.chartContainer}>
                    <StatusCharts
                        summaryData={reportSummary}
                        violationTypesData={violationTypesSummary}
                    />
                </div>

                {/* Khu vực danh sách */}
                <div style={{ flex: 2, overflow: 'hidden', overflowY: 'auto' }}>
                    <div className={styles.reportList}>
                        <p className='text_4'>Danh sách giáo viên giảng dạy</p>
                        {filteredReports.length > 0 ? (
                            filteredReports.map(report => (
                                <div key={report.teacherInfo._id} className={styles.reportCard}>
                                    <div className={styles.cardHeader} onClick={() => toggleDetails(report.teacherInfo._id)}>
                                        <p className={styles.teacherName}>{report.teacherInfo.name}</p>
                                        <div className={styles.violationsSummary}>
                                            <span className={styles.summaryText}>
                                                <span className={styles.violationCount}>{report.violationsInScope}</span> / {report.totalInScope} buổi
                                            </span>
                                            <ChevronIcon expanded={visibleTeacher === report.teacherInfo._id} />
                                        </div>
                                    </div>

                                    {visibleTeacher === report.teacherInfo._id && (
                                        <div className={styles.detailsContainer}>
                                            {report.lessonsToDisplay.map(lesson => (
                                                <Link href={`/course/${lesson.courseId}/${lesson.lessonId}`} key={lesson.lessonId} className={`${styles.lessonItem} ${lesson.isViolation ? styles.violation : styles.completed}`}>
                                                    <div className={styles.lessonInfo}>
                                                        <span className={styles.lessonCourseId}>{lesson.courseId}</span>
                                                        <span className={styles.lessonDate}>{new Date(lesson.day).toLocaleDateString('vi-VN')}</span>
                                                        <span className={styles.lessonRoom}>{lesson.room || 'N/A'}</span>
                                                    </div>
                                                    {lesson.isViolation ? (
                                                        <div className={styles.errorTags}>
                                                            {lesson.errors.attendance && <span className={`${styles.errorTag} ${styles.attendance}`}>Thiếu Điểm Danh</span>}
                                                            {lesson.errors.comment && <span className={`${styles.errorTag} ${styles.comment}`}>Thiếu Nhận Xét</span>}
                                                            {lesson.errors.image && <span className={`${styles.errorTag} ${styles.image}`}>Thiếu Hình Ảnh</span>}
                                                        </div>
                                                    ) : (
                                                        <div className={styles.completionStatus}>
                                                            <CheckCircleIcon />
                                                            <span>Hoàn thành</span>
                                                        </div>
                                                    )}
                                                </Link>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            ))
                        ) : (
                            <p className={styles.noResults}>Không có dữ liệu nào phù hợp với bộ lọc.</p>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default EnhancedViolationsReport;