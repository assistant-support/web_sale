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

export default models?.MarketingCost || model('MarketingCost', MarketingCostSchema);

