import { Schema, model, models } from 'mongoose';
import '@/models/formclient';

const MarketingCostSchema = new Schema(
    {
        // Loại kênh: form (nguồn form chuẩn) hoặc message (nguồn tin nhắn như \"Tin nhắn - Facebook - ...\")
        channelType: { type: String, enum: ['form', 'message'], default: 'form' },

        // Kênh dạng form (nguồn chuẩn) – ref tới model 'form'
        source: { type: Schema.Types.ObjectId, ref: 'form' },

        // Kênh dạng tin nhắn – lưu key sourceDetails, ví dụ: \"Tin nhắn - Facebook - BLING KIM Aesthetic Clinic\"
        messageSourceKey: { type: String, trim: true },

        startDate: { type: Date, required: true },
        endDate: { type: Date, required: true },
        amount: { type: Number, required: true, min: 0 },
        note: { type: String, trim: true },
        createdBy: { type: Schema.Types.ObjectId, ref: 'user' },
    },
    { timestamps: true }
);

// Index phục vụ báo cáo marketing & financial:
// - Lọc và aggregate theo kênh form (source) + khoảng ngày [startDate, endDate]
MarketingCostSchema.index({ source: 1, startDate: 1, endDate: 1 });
// - Tối ưu cho rebuild financial_reports_daily: tìm mọi cost áp dụng cho một ngày bất kỳ
MarketingCostSchema.index({ startDate: 1, endDate: 1 });

export default models?.MarketingCost || model('MarketingCost', MarketingCostSchema);

