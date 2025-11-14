// models/services.model.js
import { Schema, model, models } from 'mongoose';

const SERVICE_TYPES = ['noi_khoa', 'ngoai_khoa', 'da_lieu'];
const SALE_GROUP_TYPES = ['noi_khoa', 'ngoai_khoa'];

function toSlug(input) {
    return String(input)
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .toLowerCase().trim()
        .replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '');
}

/** Dịch vụ tối giản + các counters */
const serviceSchema = new Schema({
    /** Tên hiển thị */
    name: { type: String, required: true, trim: true },

    /** Slug duy nhất để truy vấn/SEO */
    slug: { type: String, required: true, unique: true, index: true },

    /** Loại dịch vụ */
    type: { type: String, enum: SERVICE_TYPES, required: true, index: true },

    /** Nhóm sale phụ trách (tùy chọn) */
    saleGroup: { type: String, enum: [...SALE_GROUP_TYPES, null], default: null },

    /** Sale phụ trách mặc định (ID người dùng) */
    defaultSale: { type: String, default: null },

    /** Mô tả ngắn */
    description: { type: String },

    /** Ảnh nền/cover hiển thị cho dịch vụ */
    cover: { type: String, default: '' },

    /** Trạng thái (soft delete) */
    isActive: { type: Boolean, default: true, index: true },

    /** Counters: số người quan tâm, số đánh giá, số khách hoàn tất */
    stats: {
        interest: { type: Number, default: 0 }, // số người quan tâm
        reviews: { type: Number, default: 0 }, // số đánh giá
        completed: { type: Number, default: 0 }, // số khách đã chốt hoàn thành
    },

    // =================================================================
    // CÁC TRƯỜNG MỚI ĐƯỢC THÊM VÀO
    // =================================================================

    /**
     * Trường 1: Quy định các liệu trình và chi phí tương ứng
     * Mảng các liệu trình, mỗi liệu trình có tên, mô tả và cấu trúc chi phí linh hoạt.
     */
    treatmentCourses: [{
        name: { type: String, required: true, trim: true },
        description: { type: String },
        costs: {
            basePrice: { type: Number, required: true, default: 0 },
            otherFees: { type: Number, default: 0 },
        }
    }],

    /**
     * Trường 2: Lưu trữ tin nhắn gửi trước phẫu thuật
     * Mảng các tin nhắn, mỗi tin nhắn gắn với một liệu trình cụ thể.
     */
    preSurgeryMessages: [{
        /** Tên của liệu trình trong mảng treatmentCourses mà tin nhắn này áp dụng */
        appliesToCourse: { type: String, required: true },
        /** Nội dung tin nhắn */
        content: { type: String, required: true }
    }],

    /**
     * Trường 3: Lưu trữ tin nhắn tự động gửi sau phẫu thuật
     * Mảng các tin nhắn được lên lịch gửi sau một khoảng thời gian nhất định.
     */
    postSurgeryMessages: [{
        /** Tên của liệu trình trong mảng treatmentCourses mà tin nhắn này áp dụng */
        appliesToCourse: { type: String, required: true },
        /** Thời gian gửi sau khi liệu trình hoàn tất */
        sendAfter: {
            value: { type: Number, required: true },
            unit: { type: String, required: true, enum: ['days', 'hours', 'weeks', 'months'] }
        },
        /** Nội dung tin nhắn */
        content: { type: String, required: true }
    }],

}, { timestamps: true });

serviceSchema.pre('validate', function (next) {
    if (!this.slug && this.name) this.slug = toSlug(this.name);
    next();
});

serviceSchema.index({ name: 'text', description: 'text' });

const Service = models.service || model('service', serviceSchema);
export default Service;