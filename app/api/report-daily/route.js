'use server';

import connectDB from '@/config/connectDB';
import ReportDaily from '@/models/report_daily.model';

/**
 * API route để lấy dữ liệu từ report_daily
 * GET /api/report-daily?fromDate=YYYY-MM-DD&toDate=YYYY-MM-DD
 */
export async function GET(request) {
    try {
        await connectDB();
        
        const { searchParams } = new URL(request.url);
        const fromDate = searchParams.get('fromDate');
        const toDate = searchParams.get('toDate');
        
        // Build query
        const query = {};
        
        if (fromDate || toDate) {
            query.date = {};
            if (fromDate) {
                const from = new Date(fromDate + 'T00:00:00.000Z');
                from.setUTCHours(0, 0, 0, 0);
                query.date.$gte = from;
            }
            if (toDate) {
                // Dùng $lt với ngày tiếp theo để lấy tất cả trong ngày toDate
                const to = new Date(toDate + 'T00:00:00.000Z');
                to.setUTCDate(to.getUTCDate() + 1);
                to.setUTCHours(0, 0, 0, 0);
                query.date.$lt = to;
            }
        }
        
        // Query report_daily
        const reports = await ReportDaily.find(query)
            .sort({ date: 1 }) // Sort theo date tăng dần
            .lean();
        
        // Transform data để dễ sử dụng
        const transformed = reports.map(r => {
            // Xử lý Map từ Mongoose - convert sang plain object
            let revenue_by_source = {};
            if (r.revenue_by_source) {
                try {
                    if (r.revenue_by_source instanceof Map) {
                        // Kiểm tra Map có rỗng không
                        if (r.revenue_by_source.size > 0) {
                            revenue_by_source = Object.fromEntries(r.revenue_by_source);
                        }
                    } else if (typeof r.revenue_by_source === 'object' && r.revenue_by_source !== null) {
                        revenue_by_source = r.revenue_by_source;
                    }
                } catch (e) {
                    console.warn('Error converting revenue_by_source:', e);
                    revenue_by_source = {};
                }
            }
            
            let revenue_by_service = {};
            if (r.revenue_by_service) {
                try {
                    if (r.revenue_by_service instanceof Map) {
                        // Kiểm tra Map có rỗng không
                        if (r.revenue_by_service.size > 0) {
                            revenue_by_service = Object.fromEntries(r.revenue_by_service);
                        }
                    } else if (typeof r.revenue_by_service === 'object' && r.revenue_by_service !== null) {
                        revenue_by_service = r.revenue_by_service;
                    }
                } catch (e) {
                    console.warn('Error converting revenue_by_service:', e);
                    revenue_by_service = {};
                }
            }
            
            return {
                _id: r._id,
                date: r.date,
                total_completed_orders: r.total_completed_orders || 0,
                total_revenue: r.total_revenue || 0,
                total_cost: r.total_cost || 0,
                total_profit: r.total_profit || 0,
                total_new_customers: r.total_new_customers || 0,
                total_old_customers: r.total_old_customers || 0,
                revenue_by_source: revenue_by_source,
                revenue_by_service: revenue_by_service,
            };
        });
        
        // Tính tổng
        const totals = transformed.reduce((acc, r) => {
            acc.total_completed_orders += r.total_completed_orders;
            acc.total_revenue += r.total_revenue;
            acc.total_cost += r.total_cost;
            acc.total_profit += r.total_profit;
            acc.total_new_customers += r.total_new_customers;
            acc.total_old_customers += r.total_old_customers;
            
            // Tổng hợp revenue_by_source
            Object.entries(r.revenue_by_source || {}).forEach(([sourceId, revenue]) => {
                acc.revenue_by_source[sourceId] = (acc.revenue_by_source[sourceId] || 0) + revenue;
            });
            
            // Tổng hợp revenue_by_service
            Object.entries(r.revenue_by_service || {}).forEach(([serviceId, revenue]) => {
                acc.revenue_by_service[serviceId] = (acc.revenue_by_service[serviceId] || 0) + revenue;
            });
            
            return acc;
        }, {
            total_completed_orders: 0,
            total_revenue: 0,
            total_cost: 0,
            total_profit: 0,
            total_new_customers: 0,
            total_old_customers: 0,
            revenue_by_source: {},
            revenue_by_service: {},
        });
        
        return Response.json({
            success: true,
            data: transformed,
            totals: totals
        });
    } catch (error) {
        console.error('Error in GET /api/report-daily:', error);
        return Response.json({
            success: false,
            error: error.message || 'Lỗi server khi lấy dữ liệu report_daily',
            data: [],
            totals: {
                total_completed_orders: 0,
                total_revenue: 0,
                total_cost: 0,
                total_profit: 0,
                total_new_customers: 0,
                total_old_customers: 0,
                revenue_by_source: {},
                revenue_by_service: {},
            }
        }, { status: 500 });
    }
}

