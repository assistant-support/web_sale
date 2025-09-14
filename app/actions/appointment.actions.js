'use server';

import connectDB from "@/config/connectDB";
import Appointment from "@/models/appointment.model";
import Customer from "@/models/customer.model";
import checkAuthToken from '@/utils/checktoken';
import { reloadAppointments } from '@/data/appointment_db/wraperdata.db';
import { revalidateData } from '@/app/actions/customer.actions';

/**
 * Action để tạo lịch hẹn mới.
 * Đồng thời cập nhật pipelineStatus của khách hàng.
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
    // Nếu bạn có field appointmentType trong form, lấy thêm:
    const appointmentType = formData.get('appointmentType'); // 'interview' | 'surgery' (optional)

    if (!customerId || !title || !appointmentDate) {
        return { status: false, message: 'Vui lòng điền đầy đủ thông tin lịch hẹn' };
    }

    try {
        await connectDB();

        // 1. Tạo lịch hẹn mới
        const newAppointment = await Appointment.create({
            customer: customerId,
            title,
            appointmentDate: new Date(appointmentDate),
            notes,
            status: 'pending', // Trạng thái ban đầu của lịch hẹn
            createdBy: user.id,
            ...(appointmentType ? { appointmentType } : {}), // nếu có
        });

        // 1.1 Lên lịch job nhắc hẹn (Agenda)
        // -----------------------------------
        // Thời điểm nhắc = 24h trước lịch hẹn; nếu đã <24h thì gửi sau 1 phút
        const { default: initAgenda } = await import('@/config/agenda');
        const agenda = await initAgenda();

        const apptTime = new Date(newAppointment.appointmentDate).getTime();
        const remindAt = new Date(apptTime - 24 * 60 * 60 * 1000);
        const now = new Date();
        const scheduledTime = remindAt > now ? remindAt : new Date(now.getTime() + 60 * 1000); // Phương án A

        await agenda.schedule(scheduledTime, 'appointmentReminder', {
            appointmentId: newAppointment._id.toString(),
            customerId: customerId.toString(),
        });
        // -----------------------------------

        // 2. Cập nhật khách hàng: Thêm care log và cập nhật pipelineStatus
        const newPipelineStatus = 'scheduled_unconfirmed_4'; // Trạng thái pipeline khi mới đặt lịch
        const careEntry = {
            content: `Đặt lịch hẹn: ${title} vào ${new Date(appointmentDate).toLocaleString('vi-VN')}`,
            createBy: user.id,
            step: 5, // Giai đoạn 5: Nhắc lịch & Xác nhận
            createAt: new Date()
        };

        await Customer.findByIdAndUpdate(customerId, {
            $push: { care: careEntry },
            $set: {
                'pipelineStatus.0': newPipelineStatus,
                'pipelineStatus.5': newPipelineStatus,
            }
        });

        // 3. Revalidate data để làm mới giao diện
        await reloadAppointments();
        await revalidateData();

        return { status: true, message: 'Đã tạo lịch hẹn thành công!' };
    } catch (error) {
        console.error('Lỗi khi tạo lịch hẹn:', error);
        return { status: false, message: 'Đã xảy ra lỗi khi tạo lịch hẹn' };
    }
}


/**
 * Action để cập nhật trạng thái lịch hẹn.
 * Đồng thời cập nhật pipelineStatus của khách hàng tương ứng.
 */
export async function updateAppointmentStatusAction(prevState, formData) {
    const user = await checkAuthToken();
    if (!user || !user.id) {
        return { status: false, message: 'Bạn cần đăng nhập để thực hiện chức năng này' };
    }

    const appointmentId = formData.get('appointmentId');
    const newStatus = formData.get('newStatus'); // e.g., 'completed', 'missed', 'confirmed'

    if (!appointmentId || !newStatus) {
        return { status: false, message: 'Thiếu thông tin cần thiết để cập nhật' };
    }

    try {
        await connectDB();

        // 1. Lấy thông tin lịch hẹn để sử dụng
        const appointment = await Appointment.findById(appointmentId).lean();
        if (!appointment) {
            return { status: false, message: 'Không tìm thấy lịch hẹn' };
        }

        // 2. Cập nhật trạng thái lịch hẹn
        await Appointment.findByIdAndUpdate(appointmentId, {
            status: newStatus,
            updatedBy: user.id,
            updatedAt: new Date()
        });

        // 3. Mapping trạng thái lịch hẹn sang pipelineStatus và care log
        const statusMap = {
            completed: { pipeline: 'serviced_completed_6', care: `Hoàn thành lịch hẹn: ${appointment.title}` },
            confirmed: { pipeline: 'confirmed_5', care: `Xác nhận lịch hẹn thành công: ${appointment.title}` },
            missed: { pipeline: 'canceled_5', care: `Khách vắng mặt trong lịch hẹn: ${appointment.title}` }, // Giả định vắng mặt tương đương hủy cho pipeline
            postponed: { pipeline: 'postponed_5', care: `Hoãn lịch hẹn: ${appointment.title}` },
        };

        const updateInfo = statusMap[newStatus];
        if (!updateInfo) {
            // Nếu không có mapping, chỉ revalidate và trả về
            await reloadAppointments();
            return { status: true, message: 'Cập nhật thành công nhưng không thay đổi pipeline.' };
        }

        const careEntry = {
            content: updateInfo.care,
            createBy: user.id,
            step: 5,
            createAt: new Date()
        };

        // 4. Cập nhật khách hàng
        await Customer.findByIdAndUpdate(appointment.customer, {
            $push: { care: careEntry },
            $set: {
                'pipelineStatus.0': updateInfo.pipeline,
                'pipelineStatus.5': updateInfo.pipeline,
            }
        });

        // 5. Revalidate data
        await reloadAppointments();
        await revalidateData();

        return { status: true, message: 'Đã cập nhật trạng thái lịch hẹn thành công!' };
    } catch (error) {
        console.error('Lỗi khi cập nhật trạng thái lịch hẹn:', error);
        return { status: false, message: 'Đã xảy ra lỗi khi cập nhật trạng thái' };
    }
}

/**
 * Action để hủy lịch hẹn.
 * Đồng thời cập nhật pipelineStatus của khách hàng thành 'canceled_5'.
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

        // 1. Lấy thông tin lịch hẹn
        const appointment = await Appointment.findById(appointmentId).lean();
        if (!appointment) {
            return { status: false, message: 'Không tìm thấy lịch hẹn' };
        }

        // 2. Cập nhật trạng thái lịch hẹn
        await Appointment.findByIdAndUpdate(appointmentId, {
            status: 'cancelled',
            updatedBy: user.id,
            updatedAt: new Date()
        });

        // 3. Cập nhật khách hàng
        const newPipelineStatus = 'canceled_5';
        const careEntry = {
            content: `Đã hủy lịch hẹn: ${appointment.title} (${new Date(appointment.appointmentDate).toLocaleString('vi-VN')})`,
            createBy: user.id,
            step: 5,
            createAt: new Date()
        };

        await Customer.findByIdAndUpdate(appointment.customer, {
            $push: { care: careEntry },
            $set: {
                'pipelineStatus.0': newPipelineStatus,
                'pipelineStatus.5': newPipelineStatus,
            }
        });

        // 4. Revalidate data
        await reloadAppointments();
        await revalidateData();

        return { status: true, message: 'Đã hủy lịch hẹn thành công!' };
    } catch (error) {
        console.error('Lỗi khi hủy lịch hẹn:', error);
        return { status: false, message: 'Đã xảy ra lỗi khi hủy lịch hẹn' };
    }
}

/**
 * Lấy lịch hẹn theo ngày (Không thay đổi)
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
        const startOfDay = new Date(selectedDate.setHours(0, 0, 0, 0));
        const endOfDay = new Date(selectedDate.setHours(23, 59, 59, 999));

        const appointments = await Appointment.find({
            appointmentDate: {
                $gte: startOfDay,
                $lt: endOfDay
            }
        }).populate('customer', 'name phone zaloname').lean();

        return { status: true, data: JSON.parse(JSON.stringify(appointments)) };
    } catch (error) {
        console.error('Lỗi khi lấy lịch hẹn theo ngày:', error);
        return { status: false, message: 'Đã xảy ra lỗi khi lấy lịch hẹn' };
    }
}