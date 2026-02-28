// models/report_daily.model.js
import { Schema, model, models } from 'mongoose';

/**
 * Collection report_daily: Tầng analytics để thống kê doanh thu
 * Mỗi document = 1 ngày
 * Dashboard CHỈ ĐỌC từ collection này, không bao giờ aggregate từ orders
 */
const ReportDailySchema = new Schema(
    {
        // _id là string format "YYYY-MM-DD" (ví dụ: "2026-01-15")
        _id: { 
            type: String, 
            required: true,
            unique: true
        },
        
        // Date object để query dễ dàng
        date: { 
            type: Date, 
            required: true,
            index: true
        },
        
        // Tổng số đơn đã hoàn thành trong ngày
        total_completed_orders: { 
            type: Number, 
            default: 0, 
            min: 0 
        },
        
        // Tổng doanh thu trong ngày
        total_revenue: { 
            type: Number, 
            default: 0, 
            min: 0 
        },
        
        // Tổng chi phí trong ngày
        total_cost: { 
            type: Number, 
            default: 0, 
            min: 0 
        },
        
        // Tổng lợi nhuận trong ngày
        total_profit: { 
            type: Number, 
            default: 0 
        },
        
        // Số khách hàng mới (đơn đầu tiên) trong ngày
        total_new_customers: { 
            type: Number, 
            default: 0, 
            min: 0 
        },
        
        // Số khách hàng cũ (đã có đơn trước đó) trong ngày
        total_old_customers: { 
            type: Number, 
            default: 0, 
            min: 0 
        },
        
        // Doanh thu theo nguồn (sourceId -> revenue)
        revenue_by_source: {
            type: Map,
            of: Number,
            default: {}
        },
        
        // Doanh thu theo dịch vụ (serviceId -> revenue)
        revenue_by_service: {
            type: Map,
            of: Number,
            default: {}
        },
    },
    { 
        timestamps: false,
        versionKey: false 
    }
);

// Index cho date để query nhanh
ReportDailySchema.index({ date: 1 });

const ReportDaily = models.report_daily || model('report_daily', ReportDailySchema);

export default ReportDaily;

