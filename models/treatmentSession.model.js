import { Schema, model, models } from 'mongoose';

/**
 * Mỗi document là 1 lần khách thực hiện 1 liệu trình cụ thể của 1 dịch vụ.
 * Thiết kế theo tài liệu hienthilieutrinhdichvu.md.
 */
const treatmentSessionSchema = new Schema(
    {
        customerId: { type: Schema.Types.ObjectId, ref: 'customer', required: true, index: true },
        serviceId: { type: Schema.Types.ObjectId, ref: 'service', required: true, index: true },
        // Chính là _id của phần tử trong service.treatmentCourses
        courseId: { type: Schema.Types.ObjectId, required: true, index: true },
        // Đơn service_details sinh ra buổi điều trị này (nếu có)
        serviceDetailId: { type: Schema.Types.ObjectId, ref: 'service_detail', required: false },
        // Ngày thực hiện buổi điều trị
        performedAt: { type: Date, required: true, index: true },
        // Ngày tạo record
        createdAt: { type: Date, default: Date.now },
    },
    {
        versionKey: false,
    }
);

// Compound index tối ưu cho các truy vấn thống kê theo tài liệu:
// - Lọc theo customer, service, course
// - Sort theo thời gian để lấy lần đầu / lần cuối
treatmentSessionSchema.index(
    {
        customerId: 1,
        serviceId: 1,
        courseId: 1,
        performedAt: 1,
    },
    { name: 'customer_service_course_performedAt' }
);

const TreatmentSession =
    models.treatment_session || model('treatment_session', treatmentSessionSchema, 'treatment_sessions');

export default TreatmentSession;

