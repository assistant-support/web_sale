// app/appointments/ui/main.js
'use client';

import { useState, useEffect, useMemo, startTransition } from 'react';
import { appointment_data } from '@/data/appointment_db/wraperdata.db';
import styles from '../../index.module.css'; // File CSS duy nhất
import CenterPopup from '@/components/(features)/(popup)/popup_center';
import Title from '@/components/(features)/(popup)/title';
import Loading from '@/components/(ui)/(loading)/loading';

// === COMPONENT CON: HIỂN THỊ CHI TIẾT LỊCH HẸN TRONG POPUP ===
function AppointmentDetail({ appointment, onClose }) {
    if (!appointment) return null;

    const getStatusInfo = (status) => {
        switch (status) {
            case 'pending': return { text: 'Sắp diễn ra', color: 'var(--blue)' };
            case 'completed': return { text: 'Hoàn thành', color: 'var(--green)' };
            case 'cancelled': return { text: 'Đã hủy', color: '#989898' };
            case 'missed': return { text: 'Vắng mặt', color: 'var(--red)' };
            default: return { text: status, color: 'var(--text-secondary)' };
        }
    };

    return (
        <div className={styles.detailPopupContent}>
            <h4>Thông tin lịch hẹn: {appointment.title}</h4>
            <div className={styles.detailGrid}>
                <h5>Trạng thái:</h5>
                <h5 style={{ color: getStatusInfo(appointment.status).color, fontWeight: 500 }}>
                    {getStatusInfo(appointment.status).text}
                </h5>

                <h5>Thời gian:</h5>
                <h5>{new Date(appointment.appointmentDate).toLocaleString('vi-VN')}</h5>

                <h5>Người tạo:</h5>
                <h5>{appointment.createdBy?.name || 'Không rõ'}</h5>

                <h5>Ghi chú:</h5>
                <h5>{appointment.notes || 'Không có'}</h5>

                <h4>Thông tin khách hàng:</h4>
                <div></div>

                <h5>Tên KH:</h5>
                <h5>{appointment.customer?.name || 'Không rõ'}</h5>

                <h5>Điện thoại:</h5>
                <h5>{appointment.customer?.phone || 'Không rõ'}</h5>
            </div>
            <div className={styles.popupActions}>
                <button onClick={onClose} className="btn_s">Đóng</button>
            </div>
        </div>
    );
}

// === COMPONENT CON: HIỂN THỊ DANH SÁCH LỊCH HẸN CỦA MỘT NGÀY ===
function DayAppointmentsPopup({ date, appointments, onSelect, onClose }) {
    return (
        <div className={styles.dayPopupList}>
            {appointments.map(app => (
                <div key={app._id} className={styles.dayPopupItem} onClick={() => onSelect(app)}>
                    <h5>{app.title}</h5>
                    <h6>{new Date(app.appointmentDate).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })} - KH: {app.customer.name}</h6>
                    <h6>NV: {app.createdBy.name}</h6>
                </div>
            ))}
        </div>
    )
}


export default function AppointmentCalendar({ initialAppointments, initialUsers }) {
    const [currentDate, setCurrentDate] = useState(new Date());
    const [appointments, setAppointments] = useState(initialAppointments);
    const [selectedUser, setSelectedUser] = useState('all');
    const [isLoading, setIsLoading] = useState(false);
    const [selectedAppointment, setSelectedAppointment] = useState(null);

    // THÊM MỚI: State cho popup danh sách lịch hẹn của ngày
    const [dayPopupData, setDayPopupData] = useState(null); // { date, appointments }

    useEffect(() => {
        if (currentDate.getMonth() === new Date().getMonth() && currentDate.getFullYear() === new Date().getFullYear()) {
            // Không fetch lại cho tháng hiện tại khi component mount lần đầu
            return;
        }
        const fetchNewData = async () => {
            setIsLoading(true);
            const year = currentDate.getFullYear();
            const month = currentDate.getMonth() + 1;
            const data = await appointment_data({ year, month });
            setAppointments(data);
            setIsLoading(false);
        };
        fetchNewData();
    }, [currentDate]);

    const filteredAppointments = useMemo(() => {
        if (selectedUser === 'all') return appointments;
        return appointments.filter(app => app.createdBy?._id === selectedUser);
    }, [appointments, selectedUser]);

    const handleNav = (type, amount) => {
        const newDate = new Date(currentDate);
        if (type === 'month') newDate.setMonth(newDate.getMonth() + amount);
        else if (type === 'year') newDate.setFullYear(newDate.getFullYear() + amount);
        startTransition(() => {
            setCurrentDate(newDate);
        });
    };

    // --- Logic tạo lưới lịch được CẬP NHẬT ---
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const firstDayOfWeek = 1;
    const firstDayOfMonth = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const today = new Date();

    const leadingEmptyDaysCount = (firstDayOfMonth - firstDayOfWeek + 7) % 7;
    const leadingEmptyDays = Array.from({ length: leadingEmptyDaysCount });

    const dayCells = Array.from({ length: daysInMonth }, (_, i) => {
        const day = i + 1;
        const date = new Date(year, month, day);
        const isToday = date.toDateString() === today.toDateString();

        const appointmentsForDay = filteredAppointments.filter(app => new Date(app.appointmentDate).toDateString() === date.toDateString());

        // Cải tiến hiển thị: Giới hạn số lượng hiển thị
        const MAX_ITEMS_VISIBLE = 2;
        const visibleAppointments = appointmentsForDay.slice(0, MAX_ITEMS_VISIBLE);
        const hiddenCount = appointmentsForDay.length - visibleAppointments.length;

        return (
            <div key={day} className={`${styles.dayCell} ${isToday ? styles.isToday : ''}`}>
                <div className={styles.dayNumber}>{day}</div>
                <div className={styles.appointmentsContainer}>
                    {visibleAppointments.map(app => (
                        <div
                            key={app._id}
                            className={styles.appointmentItem}
                            onClick={(e) => { e.stopPropagation(); setSelectedAppointment(app); }}
                        >
                            {app.title}
                        </div>
                    ))}
                    {hiddenCount > 0 && (
                        <div
                            className={styles.seeMoreButton}
                            onClick={() => setDayPopupData({ date, appointments: appointmentsForDay })}
                        >
                            + {hiddenCount} xem thêm
                        </div>
                    )}
                </div>
            </div>
        );
    });

    return (
        <div className={styles.calendarContainer}>
            <div className={styles.calendarHeader}>
                <div className={styles.filterContainer}>
                    <label htmlFor="user-filter">Nhân viên:</label>
                    <select id="user-filter" className="input" value={selectedUser} onChange={(e) => setSelectedUser(e.target.value)}>
                        <option value="all">Tất cả</option>
                        {initialUsers.map(user => (<option key={user._id} value={user._id}>{user.name}</option>))}
                    </select>
                </div>
                <div className={styles.navigation}>
                    <button onClick={() => handleNav('year', -1)}>&lt;&lt;</button>
                    <button onClick={() => handleNav('month', -1)}>&lt;</button>
                    <h4>Tháng {month + 1} / {year}</h4>
                    <button onClick={() => handleNav('month', 1)}>&gt;</button>
                    <button onClick={() => handleNav('year', 1)}>&gt;&gt;</button>
                    <button onClick={() => setCurrentDate(new Date())} className={styles.todayButton}>Hôm nay</button>
                </div>
            </div>

            <div className={styles.calendarGrid}>
                {['Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7', 'Chủ Nhật'].map(day => (<div key={day} className={styles.dayHeader}>{day}</div>))}
                {leadingEmptyDays.map((_, i) => <div key={`empty-${i}`} className={styles.emptyCell}></div>)}
                {dayCells}
            </div>

            {isLoading && (<div className={styles.loadingOverlay}><Loading content="Đang tải dữ liệu..." /></div>)}

            {/* Popup chi tiết (không đổi) */}
            <CenterPopup open={!!selectedAppointment} onClose={() => setSelectedAppointment(null)} size="md">
                <Title content="Chi Tiết Lịch Hẹn" click={() => setSelectedAppointment(null)} />
                <AppointmentDetail appointment={selectedAppointment} onClose={() => setSelectedAppointment(null)} />
            </CenterPopup>

            {/* THÊM MỚI: Popup danh sách lịch hẹn trong ngày */}
            <CenterPopup open={!!dayPopupData} onClose={() => setDayPopupData(null)} size="md">
                <Title content={`Tất cả lịch hẹn ngày ${dayPopupData?.date.toLocaleDateString('vi-VN')}`} click={() => setDayPopupData(null)} />
                {dayPopupData && (
                    <DayAppointmentsPopup
                        date={dayPopupData.date}
                        appointments={dayPopupData.appointments}
                        onClose={() => setDayPopupData(null)}
                        onSelect={(app) => {
                            setDayPopupData(null); // Đóng popup danh sách
                            setSelectedAppointment(app); // Mở popup chi tiết
                        }}
                    />
                )}
            </CenterPopup>
        </div>
    );
}