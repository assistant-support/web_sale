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
        serviceDetailId: { type: Schema.Types.ObjectId, ref: 'service_detail', required: false, index: true },
        // Lần sử dụng trong liệu trình (1, 2, 3, ...)
        usageIndex: { type: Number, default: 1, min: 1 },
        // Liều lượng thuốc đã dùng cho lần này (số lượng)
        medicationDose: { type: Number, default: 0, min: 0 },
        // Đơn vị thuốc (ví dụ: viên, ống, ml...)
        medicationUnit: { type: String, trim: true, default: '' },
        // Ngày bắt đầu sử dụng thuốc cho lần này
        startDate: { type: Date },
        // Ngày kết thúc sử dụng thuốc cho lần này
        endDate: { type: Date },
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

// Tối ưu truy vấn cho từng đơn + liệu trình
treatmentSessionSchema.index(
    {
        serviceDetailId: 1,
        courseId: 1,
        usageIndex: 1,
    },
    { name: 'serviceDetail_course_usage' }
);

const TreatmentSession =
    models.treatment_session || model('treatment_session', treatmentSessionSchema, 'treatment_sessions');

export default TreatmentSession;

