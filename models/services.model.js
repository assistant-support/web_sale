// models/services.model.js
import { Schema, model, models } from 'mongoose';

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
    type: { type: String, enum: ['noi_khoa', 'ngoai_khoa'], required: true, index: true },

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
}, { timestamps: true });

serviceSchema.pre('validate', function (next) {
    if (!this.slug && this.name) this.slug = toSlug(this.name);
    next();
});

serviceSchema.index({ name: 'text', description: 'text' });

const Service = models.service || model('service', serviceSchema);
export default Service;
