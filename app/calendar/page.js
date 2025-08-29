// app/appointments/page.js

import { appointment_data } from '@/data/appointment_db/wraperdata.db';
import AppointmentCalendar from './ui/main';
import styles from './index.module.css';
import { user_data } from '@/data/actions/get';

// Thêm `searchParams` vào props của page
export default async function CalendarPage({ searchParams }) {
    searchParams = await searchParams
    const today = new Date();

    // Lấy năm và tháng từ URL, nếu không có thì dùng ngày hiện tại
    const year = searchParams.year ? parseInt(searchParams.year, 10) : today.getFullYear();
    const month = searchParams.month ? parseInt(searchParams.month, 10) : today.getMonth() + 1;

    // Tải dữ liệu ban đầu cho đúng tháng trên server
    const initialAppointments = await appointment_data({ year: year, month: month });
    const users = await user_data({});

    return (
        <div className={styles.pageContainer}>
            <AppointmentCalendar
                initialAppointments={initialAppointments}
                initialUsers={users}
            />
        </div>
    );
}