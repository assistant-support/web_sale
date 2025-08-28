// data/actions/appointment.actions.js
'use server';

import dbConnect from "@/config/connectDB";
import Appointment from "@/models/appointment.model";
import checkAuthToken from '@/utils/checktoken';
import { reloadAppointments } from '@/data/appointment_db/wraperdata.db' // Import từ file wrapper bạn đã tạo
import mongoose from 'mongoose';

/**
 * Action để tạo một lịch hẹn mới.
 */
export async function createAppointmentAction(_previousState, formData) {
    // --- BƯỚC 1: XÁC THỰC VÀ PHÂN QUYỀN ---
    const user = await checkAuthToken();
    if (!user || !user.id) {
        return { message: 'Bạn cần đăng nhập để thực hiện hành động này.', status: false };
    }
    // Giả sử cả Admin và Sale đều có quyền tạo lịch hẹn
    if (!user.role.includes('Admin') && !user.role.includes('Sale')) {
        return { message: 'Bạn không có quyền thực hiện chức năng này', status: false };
    }

    // --- BƯỚC 2: LẤY VÀ VALIDATE DỮ LIỆU TỪ FORM ---
    const title = formData.get('title');
    const customerId = formData.get('customerId');
    const appointmentDateStr = formData.get('appointmentDate');
    const notes = formData.get('notes');

    if (!title || !customerId || !appointmentDateStr) {
        return { message: 'Tiêu đề, khách hàng và ngày hẹn là bắt buộc.', status: false };
    }

    if (!mongoose.Types.ObjectId.isValid(customerId)) {
        return { message: 'ID Khách hàng không hợp lệ.', status: false };
    }

    const appointmentDate = new Date(appointmentDateStr);
    if (isNaN(appointmentDate.getTime())) {
        return { message: 'Ngày hẹn không hợp lệ.', status: false };
    }

    // Kiểm tra xem ngày hẹn có ở trong quá khứ không
    const now = new Date();
    if (appointmentDate < new Date(now.getFullYear(), now.getMonth(), now.getDate())) {
        return { message: 'Không thể đặt lịch hẹn cho một ngày trong quá khứ.', status: false };
    }


    // --- BƯỚC 3: XỬ LÝ LOGIC DATABASE ---
    try {
        await dbConnect();

        const newAppointment = new Appointment({
            title: title.trim(),
            customer: customerId,
            appointmentDate: appointmentDate,
            notes: notes?.trim() || "",
            createdBy: user.id,
            status: 'pending' // Trạng thái mặc định khi mới tạo
        });

        await newAppointment.save();

        // Xóa cache để giao diện cập nhật dữ liệu mới
        reloadAppointments();

        return { message: `Đã tạo thành công lịch hẹn "${title}".`, status: true };

    } catch (error) {
        console.error("Lỗi tạo lịch hẹn:", error);
        return { message: 'Lỗi hệ thống, không thể tạo lịch hẹn.', status: false };
    }
}

/**
 * Action để cập nhật trạng thái của một lịch hẹn (ví dụ: đã hoàn thành hoặc vắng mặt).
 */
export async function updateAppointmentStatusAction(_previousState, formData) {
    const user = await checkAuthToken();
    if (!user || !user.id) {
        return { message: 'Bạn cần đăng nhập để thực hiện hành động này.', status: false };
    }
    if (!user.role.includes('Admin') && !user.role.includes('Sale')) {
        return { message: 'Bạn không có quyền thực hiện chức năng này', status: false };
    }

    const appointmentId = formData.get('appointmentId');
    const newStatus = formData.get('newStatus'); // Trạng thái mới: 'completed' hoặc 'missed'

    if (!appointmentId || !newStatus) {
        return { message: 'Dữ liệu không hợp lệ (thiếu ID hoặc trạng thái mới).', status: false };
    }

    if (!mongoose.Types.ObjectId.isValid(appointmentId)) {
        return { message: 'ID Lịch hẹn không hợp lệ.', status: false };
    }

    // Chỉ cho phép cập nhật thành các trạng thái hợp lệ
    const allowedStatuses = ['completed', 'missed'];
    if (!allowedStatuses.includes(newStatus)) {
        return { message: 'Trạng thái cập nhật không hợp lệ.', status: false };
    }

    try {
        await dbConnect();

        const updatedAppointment = await Appointment.findByIdAndUpdate(
            appointmentId,
            { status: newStatus },
            { new: true } // Trả về document sau khi đã cập nhật
        );

        if (!updatedAppointment) {
            return { message: 'Không tìm thấy lịch hẹn để cập nhật.', status: false };
        }

        reloadAppointments();
        return { message: 'Cập nhật trạng thái lịch hẹn thành công!', status: true };

    } catch (error) {
        console.error("Lỗi cập nhật trạng thái lịch hẹn:", error);
        return { message: 'Lỗi hệ thống, không thể cập nhật trạng thái.', status: false };
    }
}


/**
 * Action để hủy một lịch hẹn (chuyển trạng thái sang 'cancelled').
 */
export async function cancelAppointmentAction(_previousState, formData) {
    const user = await checkAuthToken();
    if (!user || !user.id) {
        return { message: 'Bạn cần đăng nhập để thực hiện hành động này.', status: false };
    }
    if (!user.role.includes('Admin') && !user.role.includes('Sale')) {
        return { message: 'Bạn không có quyền thực hiện chức năng này', status: false };
    }

    const appointmentId = formData.get('appointmentId');

    if (!appointmentId || !mongoose.Types.ObjectId.isValid(appointmentId)) {
        return { message: 'ID Lịch hẹn không hợp lệ.', status: false };
    }

    try {
        await dbConnect();

        const appointmentToCancel = await Appointment.findById(appointmentId);
        if (!appointmentToCancel) {
            return { message: 'Không tìm thấy lịch hẹn để hủy.', status: false };
        }

        // Kiểm tra xem lịch hẹn đã ở trạng thái hoàn thành hoặc đã bị hủy chưa
        if (['completed', 'cancelled'].includes(appointmentToCancel.status)) {
            return { message: `Không thể hủy lịch hẹn đã ${appointmentToCancel.status === 'completed' ? 'hoàn thành' : 'bị hủy'}.`, status: false };
        }

        appointmentToCancel.status = 'cancelled';
        await appointmentToCancel.save();

        reloadAppointments();
        return { message: 'Hủy lịch hẹn thành công!', status: true };

    } catch (error) {
        console.error("Lỗi hủy lịch hẹn:", error);
        return { message: 'Lỗi hệ thống, không thể hủy lịch hẹn.', status: false };
    }
}

