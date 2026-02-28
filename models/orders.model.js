// models/orders.model.js
import { Schema, model, models } from 'mongoose';

/**
 * Collection orders: Lưu trữ raw data của các đơn đã được duyệt (completed)
 * Chỉ dùng để lưu lịch sử và truy vết, KHÔNG dùng để thống kê runtime
 */
const OrderSchema = new Schema(
    {
        // Reference đến customer
        customerId: { 
            type: Schema.Types.ObjectId, 
            ref: 'customer', 
            required: true, 
            index: true 
        },
        
        // Reference đến service
        serviceId: { 
            type: Schema.Types.ObjectId, 
            ref: 'service', 
            required: true, 
            index: true 
        },
        
        // Reference đến service_detail (đơn gốc)
        serviceDetailId: {
            type: Schema.Types.ObjectId,
            ref: 'service_detail',
            required: true,
            index: true
        },
        
        // Reference đến nguồn (source)
        sourceId: { 
            type: Schema.Types.ObjectId, 
            ref: 'form', 
            index: true 
        },
        sourceDetails: { type: String, trim: true },
        
        // Giá và doanh thu
        price: { type: Number, required: true, min: 0 }, // finalPrice từ pricing
        revenue: { type: Number, required: true, min: 0 }, // Doanh thu ghi nhận
        cost: { type: Number, default: 0, min: 0 }, // Tổng chi phí (từ costs)
        profit: { type: Number, default: 0, min: 0 }, // profit = revenue - cost
        
        // Trạng thái
        status: { 
            type: String, 
            enum: ['pending', 'completed', 'cancelled'], 
            default: 'completed',
            index: true
        },
        
        // Ngày hoàn thành (khi đơn được duyệt)
        completedAt: { 
            type: Date, 
            default: Date.now,
            index: true
        },
        
        // Ngày tạo đơn (từ service_detail)
        createdAt: { 
            type: Date, 
            default: Date.now,
            index: true
        },
        
        // Thông tin người duyệt
        approvedBy: { type: Schema.Types.ObjectId, ref: 'user' },
        approvedAt: { type: Date },
    },
    { 
        timestamps: false, // Không dùng timestamps, dùng createdAt và completedAt
        versionKey: false 
    }
);

// Indexes để tối ưu query (nhưng không dùng để thống kê runtime)
OrderSchema.index({ customerId: 1, completedAt: -1 });
OrderSchema.index({ serviceId: 1, completedAt: -1 });
OrderSchema.index({ sourceId: 1, completedAt: -1 });
OrderSchema.index({ status: 1, completedAt: -1 });
OrderSchema.index({ completedAt: -1 });

const Order = models.order || model('order', OrderSchema);

export default Order;

