// models/Service.js

import { Schema, model, models } from 'mongoose';

/** Schema cho Service lưu trữ thông tin dịch vụ y tế/thẩm mỹ. */
const serviceSchema = new Schema({
    /** Tên dịch vụ, phải duy nhất. */
    name: {
        type: String,
        required: true,
        trim: true,
        unique: true
    },
    /** Loại dịch vụ: nội khoa hoặc ngoại khoa. */
    type: {
        type: String,
        enum: ['noi_khoa', 'ngoai_khoa'],
        required: true
    },
    /** Mô tả chi tiết về dịch vụ. */
    description: {
        type: String,
        required: true
    },
    /** Giá dịch vụ tổng, không âm. */
    price: {
        type: Number,
        required: true,
        min: 0
    },
    /** Mảng các loại phí chi tiết cho liệu trình (phí thuốc, phí buổi 1-10...), hỗ trợ khách dừng giữa chừng. */
    fees: [{
        /** Mô tả phí (tùy chọn). */
        description: { type: String },
        /** Số tiền phí, không âm. */
        amount: { type: Number, required: true, min: 0 }
    }],
    /** Thời gian tạo dịch vụ. */
    createdAt: {
        type: Date,
        default: Date.now
    },
    /** Thời gian cập nhật dịch vụ. */
    updatedAt: {
        type: Date,
        default: Date.now
    }
});

// Middleware tự động cập nhật updatedAt trước khi lưu.
serviceSchema.pre('save', function (next) {
    this.updatedAt = Date.now();
    next();
});

// Index để tìm kiếm nhanh theo tên và loại.
serviceSchema.index({ name: 'text', type: 1 });

// Xuất mô hình, tái sử dụng nếu tồn tại để tránh ghi đè.
const Service = models.service || model('service', serviceSchema);
export default Service;