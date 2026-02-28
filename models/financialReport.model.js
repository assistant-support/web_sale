import { Schema, model, models } from 'mongoose';

/**
 * financial_reports: tổng hợp báo cáo tài chính theo tháng + theo service.
 * Một document = 1 dịch vụ trong 1 tháng.
 */
const FinancialReportSchema = new Schema(
    {
        serviceId: { type: Schema.Types.ObjectId, ref: 'service', required: true, index: true },
        year: { type: Number, required: true, index: true },
        month: { type: Number, required: true, min: 1, max: 12, index: true },

        revenue: { type: Number, default: 0, min: 0 },           // Tổng doanh thu
        marketingCost: { type: Number, default: 0, min: 0 },     // Tổng chi phí marketing
        operationalCost: { type: Number, default: 0, min: 0 },   // Tổng chi phí vận hành

        totalCost: { type: Number, default: 0, min: 0 },         // = marketingCost + operationalCost
        profit: { type: Number, default: 0 },                    // = revenue - totalCost
        margin: { type: Number, default: 0 },                    // (%): (profit / revenue) * 100

        updatedAt: { type: Date, default: Date.now },
    },
    {
        timestamps: false,
        versionKey: false,
    }
);

// Đảm bảo 1 service chỉ có 1 record / tháng.
FinancialReportSchema.index({ serviceId: 1, year: 1, month: 1 }, { unique: true });

const FinancialReport = models.FinancialReport || model('FinancialReport', FinancialReportSchema);

export default FinancialReport;

