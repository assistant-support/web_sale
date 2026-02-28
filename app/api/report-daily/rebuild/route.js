'use server';

import connectDB from '@/config/connectDB';
import Order from '@/models/orders.model';
import ReportDaily from '@/models/report_daily.model';
import Customer from '@/models/customer.model';
import mongoose from 'mongoose';

/**
 * API route để rebuild report_daily từ orders
 * POST /api/report-daily/rebuild
 * 
 * Quy trình:
 * 1. Xóa tất cả documents trong report_daily
 * 2. Đọc tất cả orders với status = 'completed'
 * 3. Group theo ngày và tính toán lại
 * 4. Tạo lại documents trong report_daily
 */
export async function POST(request) {
    try {
        await connectDB();
        
        console.log('[rebuild report_daily] Bắt đầu rebuild...');
        
        // Bước 1: Xóa tất cả documents trong report_daily
        const deleteResult = await ReportDaily.deleteMany({});
        console.log(`[rebuild report_daily] Đã xóa ${deleteResult.deletedCount} documents cũ`);
        
        // Bước 2: Đọc tất cả orders với status = 'completed'
        const allOrders = await Order.find({ status: 'completed' })
            .sort({ completedAt: 1 }) // Sort theo ngày để xử lý đúng thứ tự (quan trọng cho việc xác định new/old customer)
            .lean();
        
        console.log(`[rebuild report_daily] Tìm thấy ${allOrders.length} orders đã completed`);
        
        if (allOrders.length === 0) {
            return Response.json({
                success: true,
                message: 'Không có orders nào để rebuild. report_daily đã được xóa sạch.',
                deleted: deleteResult.deletedCount,
                rebuilt: 0
            });
        }
        
        // Bước 3: Group orders theo ngày và tính toán
        const dailyMap = new Map(); // dateStr -> { data, orders }
        
        for (const order of allOrders) {
            if (!order.completedAt) continue;
            
            const completedDate = new Date(order.completedAt);
            const dateStr = completedDate.toISOString().split('T')[0]; // "YYYY-MM-DD"
            const dateObj = new Date(completedDate);
            dateObj.setUTCHours(0, 0, 0, 0);
            
            if (!dailyMap.has(dateStr)) {
                dailyMap.set(dateStr, {
                    _id: dateStr,
                    date: dateObj,
                    total_completed_orders: 0,
                    total_revenue: 0,
                    total_cost: 0,
                    total_profit: 0,
                    total_new_customers: 0,
                    total_old_customers: 0,
                    revenue_by_source: {},
                    revenue_by_service: {},
                    orders: []
                });
            }
            
            const daily = dailyMap.get(dateStr);
            daily.total_completed_orders += 1;
            
            // ✅ Doanh thu: Ưu tiên dùng order.revenue (đã được tính đúng từ logic approve)
            // Nếu order.revenue không có hoặc = 0, thì dùng order.price (finalPrice - giá cuối cùng sau giảm)
            // Đảm bảo luôn dùng giá cuối cùng, không dùng giá gốc
            const revenueValue = Number(order.revenue || 0) > 0 
                ? Number(order.revenue) 
                : Number(order.price || 0);
            daily.total_revenue += revenueValue;
            daily.total_cost += Number(order.cost || 0);
            daily.total_profit += Number(order.profit || 0);
            
            // Xác định new/old customer dựa trên thứ tự orders của khách hàng
            // Đếm số orders của khách này trước order hiện tại (theo thời gian completedAt)
            const customerId = String(order.customerId?._id || order.customerId || '');
            if (customerId) {
                const previousOrdersCount = allOrders.filter(o => {
                    const oCustomerId = String(o.customerId?._id || o.customerId || '');
                    if (oCustomerId !== customerId) return false;
                    const oDate = new Date(o.completedAt);
                    return oDate < completedDate;
                }).length;
                
                if (previousOrdersCount === 0) {
                    daily.total_new_customers += 1;
                } else {
                    daily.total_old_customers += 1;
                }
            }
            
            // Thêm revenue_by_source (dùng revenueValue - giá cuối cùng)
            if (order.sourceId) {
                const sourceIdStr = String(order.sourceId);
                if (!daily.revenue_by_source[sourceIdStr]) {
                    daily.revenue_by_source[sourceIdStr] = 0;
                }
                daily.revenue_by_source[sourceIdStr] += revenueValue;
            }
            
            // Thêm revenue_by_service (dùng revenueValue - giá cuối cùng)
            if (order.serviceId) {
                const serviceIdStr = String(order.serviceId);
                if (!daily.revenue_by_service[serviceIdStr]) {
                    daily.revenue_by_service[serviceIdStr] = 0;
                }
                daily.revenue_by_service[serviceIdStr] += revenueValue;
            }
            
            daily.orders.push(order);
        }
        
        // Bước 4: Tạo lại documents trong report_daily
        const reportsToInsert = Array.from(dailyMap.values()).map(daily => {
            // Convert revenue_by_source và revenue_by_service thành Map cho Mongoose
            const revenue_by_source = new Map();
            Object.entries(daily.revenue_by_source).forEach(([key, value]) => {
                revenue_by_source.set(key, value);
            });
            
            const revenue_by_service = new Map();
            Object.entries(daily.revenue_by_service).forEach(([key, value]) => {
                revenue_by_service.set(key, value);
            });
            
            return {
                _id: daily._id,
                date: daily.date,
                total_completed_orders: daily.total_completed_orders,
                total_revenue: daily.total_revenue,
                total_cost: daily.total_cost,
                total_profit: daily.total_profit,
                total_new_customers: daily.total_new_customers,
                total_old_customers: daily.total_old_customers,
                revenue_by_source: revenue_by_source,
                revenue_by_service: revenue_by_service,
            };
        });
        
        // Insert vào report_daily
        if (reportsToInsert.length > 0) {
            await ReportDaily.insertMany(reportsToInsert);
            console.log(`[rebuild report_daily] Đã tạo lại ${reportsToInsert.length} documents trong report_daily`);
        }
        
        // Tính tổng để verify
        const totalRevenue = reportsToInsert.reduce((sum, r) => sum + (r.total_revenue || 0), 0);
        const totalOrders = reportsToInsert.reduce((sum, r) => sum + (r.total_completed_orders || 0), 0);
        
        return Response.json({
            success: true,
            message: `Đã rebuild thành công report_daily từ ${allOrders.length} orders`,
            deleted: deleteResult.deletedCount,
            rebuilt: reportsToInsert.length,
            summary: {
                total_orders: totalOrders,
                total_revenue: totalRevenue,
                date_range: {
                    from: reportsToInsert[0]?._id || null,
                    to: reportsToInsert[reportsToInsert.length - 1]?._id || null
                }
            }
        });
    } catch (error) {
        console.error('[rebuild report_daily] Error:', error);
        return Response.json({
            success: false,
            error: error.message || 'Lỗi server khi rebuild report_daily',
            stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
        }, { status: 500 });
    }
}

