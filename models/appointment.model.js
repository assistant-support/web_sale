// models/appointment.model.js

import mongoose, { Schema, model, models } from "mongoose";

const AppointmentSchema = new Schema(
    {
        // Tiêu đề hoặc mục đích của cuộc hẹn
        title: {
            type: String,
            required: true,
            trim: true,
        },
        // Khách hàng được đặt lịch hẹn (liên kết tới model Customer)
        customer: {
            type: Schema.Types.ObjectId,
            ref: 'customer',
            required: true,
            index: true, // Thêm index để tối ưu truy vấn theo customer
        },
        // Thời gian diễn ra cuộc hẹn
        appointmentDate: {
            type: Date,
            required: true,
        },
        // Ghi chú thêm cho cuộc hẹn
        notes: {
            type: String,
            trim: true,
            default: ""
        },
        // Trạng thái của cuộc hẹn
        status: {
            type: String,
            required: true,
            enum: ['pending', 'completed', 'cancelled', 'missed'], // ['Chưa diễn ra', 'Hoàn thành', 'Đã hủy', 'Vắng mặt']
            default: 'pending',
        },
        // Người tạo lịch hẹn (nhân viên, liên kết tới model User)
        createdBy: {
            type: Schema.Types.ObjectId,
            ref: 'user',
            required: true,
        }
    },
    {
        timestamps: true // Tự động thêm createdAt và updatedAt
    }
);

const Appointment = models.appointment || model("appointment", AppointmentSchema);
export default Appointment;