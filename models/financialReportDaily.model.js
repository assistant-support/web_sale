import { Schema, model, models } from 'mongoose';

/**
 * financial_reports_daily: báo cáo tài chính theo ngày + theo dịch vụ.
 * Một document = 1 dịch vụ trong 1 ngày. Dùng để lọc báo cáo theo khoảng ngày (from/to)
 * mà không cần aggregate trực tiếp từ service_details khi dữ liệu lớn.
 */
const FinancialReportDailySchema = new Schema(
    {
        date: { type: Date, required: true, index: true }, // 00:00:00 của ngày (UTC hoặc local)
        serviceId: { type: Schema.Types.ObjectId, ref: 'service', required: true, index: true },
        year: { type: Number, required: true, index: true },
        month: { type: Number, required: true, min: 1, max: 12, index: true },
        day: { type: Number, required: true, min: 1, max: 31, index: true },

        revenue: { type: Number, default: 0, min: 0 },
        marketingCost: { type: Number, default: 0, min: 0 },
        operationalCost: { type: Number, default: 0, min: 0 },
        totalCost: { type: Number, default: 0, min: 0 },
        profit: { type: Number, default: 0 },
        margin: { type: Number, default: 0 },

        updatedAt: { type: Date, default: Date.now },
    },
    {
        timestamps: false,
        versionKey: false,
    }
);

FinancialReportDailySchema.index({ date: 1, serviceId: 1 }, { unique: true });
FinancialReportDailySchema.index({ year: 1, month: 1 });

const FinancialReportDaily =
    models?.FinancialReportDaily || model('FinancialReportDaily', FinancialReportDailySchema, 'financial_reports_daily');

export default FinancialReportDaily;
