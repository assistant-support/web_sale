import { Schema, model, models } from 'mongoose';

const OperationalCostSchema = new Schema(
    {
        // Khoảng thời gian chi phí áp dụng
        startDate: { type: Date, required: true },
        endDate: { type: Date, required: true },

        // Loại chi phí (ví dụ: tiền lương, mặt bằng, điện nước...)
        costType: { type: String, required: true, trim: true }, // Loại chi phí

        // Dịch vụ liên quan (tuỳ chọn) – để có thể phân tích chi phí theo dịch vụ
        serviceId: { type: Schema.Types.ObjectId, ref: 'service', default: null, index: true },

        // Ngày chuẩn hoá để index (có thể dùng startDate hoặc 1 ngày đại diện trong khoảng)
        date: { type: Date, index: true },

        amount: { type: Number, required: true, min: 0 },
        note: { type: String, trim: true },
        createdBy: { type: Schema.Types.ObjectId, ref: 'user' },
    },
    { timestamps: true }
);

export default models?.OperationalCost || model('OperationalCost', OperationalCostSchema);

