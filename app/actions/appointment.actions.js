// data/actions/appointment.actions.js
'use server';

import connectDB from "@/config/connectDB";
import Appointment from "@/models/appointment.model";
import Customer from "@/models/customer.model"; // Import Customer model to update care field
import checkAuthToken from '@/utils/checktoken';
import mongoose from 'mongoose';
import { reloadAppointments } from '@/data/appointment_db/wraperdata.db';
import { revalidateData } from '@/app/actions/customer.actions'; // Import customer revalidation function

/**
 * Action để tạo lịch hẹn mới
 */
export async function createAppointmentAction(prevState, formData) {
    const user = await checkAuthToken();
    if (!user || !user.id) {
        return { status: false, message: 'Bạn cần đăng nhập để thực hiện chức năng này' };
    }

    const customerId = formData.get('customerId');
    const title = formData.get('title');
    const appointmentDate = formData.get('appointmentDate');
    const notes = formData.get('notes');

    if (!customerId || !title || !appointmentDate) {
        return { status: false, message: 'Vui lòng điền đầy đủ thông tin lịch hẹn' };
    }

    try {
        await connectDB();

        // Tạo lịch hẹn mới - SỬA: Sử dụng 'customer' thay vì 'customerId' để phù hợp với model
        const newAppointment = await Appointment.create({
            customer: customerId, // Đổi từ customerId thành customer
            title,
            appointmentDate: new Date(appointmentDate),
            notes,
            status: 'pending',
            createdBy: user.id,
            createdAt: new Date()
        });

        // Thêm care entry vào customer
        await Customer.findByIdAndUpdate(customerId, {
            $push: {
                care: {
                    content: `Đặt lịch hẹn: ${title} vào ${new Date(appointmentDate).toLocaleString('vi-VN')}`,
                    createBy: user.id,
                    step: 5, // Nhắc lịch & Xác nhận
                    createAt: new Date()
                }
            }
        });

        // Revalidate data for both appointments and customers
        await reloadAppointments();
        await revalidateData();

        return { status: true, message: 'Đã tạo lịch hẹn thành công!' };
    } catch (error) {
        console.error('Lỗi khi tạo lịch hẹn:', error);
        return { status: false, message: 'Đã xảy ra lỗi khi tạo lịch hẹn' };
    }
}

/**
 * Action để cập nhật trạng thái lịch hẹn
 */
export async function updateAppointmentStatusAction(prevState, formData) {
    const user = await checkAuthToken();
    if (!user || !user.id) {
        return { status: false, message: 'Bạn cần đăng nhập để thực hiện chức năng này' };
    }

    const appointmentId = formData.get('appointmentId');
    const newStatus = formData.get('newStatus');

    if (!appointmentId || !newStatus) {
        return { status: false, message: 'Thiếu thông tin cần thiết để cập nhật trạng thái' };
    }

    try {
        await connectDB();

        // Lấy thông tin lịch hẹn hiện tại để dùng trong care entry
        const appointment = await Appointment.findById(appointmentId).lean();
        if (!appointment) {
            return { status: false, message: 'Không tìm thấy lịch hẹn' };
        }

        // Cập nhật trạng thái lịch hẹn
        await Appointment.findByIdAndUpdate(appointmentId, {
            status: newStatus,
            updatedBy: user.id,
            updatedAt: new Date()
        });

        // Tạo nội dung care phù hợp với trạng thái mới
        let careContent = '';
        switch (newStatus) {
            case 'completed':
                careContent = `Hoàn thành lịch hẹn: ${appointment.title}`;
                break;
            case 'missed':
                careContent = `Khách vắng mặt trong lịch hẹn: ${appointment.title}`;
                break;
            default:
                careContent = `Cập nhật trạng thái lịch hẹn ${appointment.title} thành: ${newStatus}`;
        }

        // Thêm care entry vào customer - SỬA: Sử dụng customer thay vì customerId
        await Customer.findByIdAndUpdate(appointment.customer, {
            $push: {
                care: {
                    content: careContent,
                    createBy: user.id,
                    step: 5, // Nhắc lịch & Xác nhận
                    createAt: new Date()
                }
            }
        });

        // Revalidate data for both appointments and customers
        await reloadAppointments();
        await revalidateData();

        return { status: true, message: 'Đã cập nhật trạng thái lịch hẹn thành công!' };
    } catch (error) {
        console.error('Lỗi khi cập nhật trạng thái lịch hẹn:', error);
        return { status: false, message: 'Đã xảy ra lỗi khi cập nhật trạng thái lịch hẹn' };
    }
}

/**
 * Action để hủy lịch hẹn
 */
export async function cancelAppointmentAction(prevState, formData) {
    const user = await checkAuthToken();
    if (!user || !user.id) {
        return { status: false, message: 'Bạn cần đăng nhập để thực hiện chức năng này' };
    }

    const appointmentId = formData.get('appointmentId');

    if (!appointmentId) {
        return { status: false, message: 'Thiếu ID lịch hẹn cần hủy' };
    }

    try {
        await connectDB();

        // Lấy thông tin lịch hẹn hiện tại để dùng trong care entry
        const appointment = await Appointment.findById(appointmentId).lean();
        if (!appointment) {
            return { status: false, message: 'Không tìm thấy lịch hẹn' };
        }

        // Cập nhật trạng thái lịch hẹn thành cancelled
        await Appointment.findByIdAndUpdate(appointmentId, {
            status: 'cancelled',
            updatedBy: user.id,
            updatedAt: new Date()
        });

        // Thêm care entry vào customer - SỬA: Sử dụng customer thay vì customerId
        await Customer.findByIdAndUpdate(appointment.customer, {
            $push: {
                care: {
                    content: `Đã hủy lịch hẹn: ${appointment.title} (${new Date(appointment.appointmentDate).toLocaleString('vi-VN')})`,
                    createBy: user.id,
                    step: 5, // Nhắc lịch & Xác nhận
                    createAt: new Date()
                }
            }
        });

        // Revalidate data for both appointments and customers
        await reloadAppointments();
        await revalidateData();

        return { status: true, message: 'Đã hủy lịch hẹn thành công!' };
    } catch (error) {
        console.error('Lỗi khi hủy lịch hẹn:', error);
        return { status: false, message: 'Đã xảy ra lỗi khi hủy lịch hẹn' };
    }
}

/**
 * Lấy lịch hẹn theo ngày
 */
export async function getAppointmentsByDateAction(prevState, formData) {
    const user = await checkAuthToken();
    if (!user || !user.id) {
        return { status: false, message: 'Bạn cần đăng nhập để thực hiện chức năng này' };
    }

    const date = formData.get('date');
    if (!date) {
        return { status: false, message: 'Vui lòng chọn ngày cần xem lịch hẹn' };
    }

    try {
        await connectDB();

        const selectedDate = new Date(date);
        const nextDay = new Date(selectedDate);
        nextDay.setDate(nextDay.getDate() + 1);

        const appointments = await Appointment.find({
            appointmentDate: {
                $gte: selectedDate,
                $lt: nextDay
            }
        }).populate('customerId', 'name phone zaloname').lean();

        return { status: true, data: appointments };
    } catch (error) {
        console.error('Lỗi khi lấy lịch hẹn theo ngày:', error);
        return { status: false, message: 'Đã xảy ra lỗi khi lấy lịch hẹn' };
    }
}

