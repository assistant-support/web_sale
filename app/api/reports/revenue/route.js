import { NextResponse } from 'next/server';
import connectDB from '@/config/connectDB';
import ServiceDetail from '@/models/service_details.model';

/**
 * Báo cáo doanh thu - nguồn: service_details (đơn completed + approved).
 * Query: from, to (mặc định = đầu tháng ~ cuối tháng hiện tại).
 * Trả về: summary (totalRevenue, totalOrders, totalCustomers), topService, services (bảng dịch vụ).
 */
export async function GET(req) {
    try {
        await connectDB();

        const { searchParams } = new URL(req.url);
        const fromParam = searchParams.get('from');
        const toParam = searchParams.get('to');

        const now = new Date();
        const fromDate = fromParam
            ? new Date(fromParam + 'T00:00:00')
            : new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
        const toDate = toParam
            ? new Date(toParam + 'T23:59:59.999')
            : new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);

        const match = {
            status: 'completed',
            approvalStatus: 'approved',
            closedAt: { $gte: fromDate, $lte: toDate },
        };

        // 1) Summary: tổng doanh thu, tổng đơn, số khách hàng có doanh thu (distinct customerId)
        const summaryAgg = await ServiceDetail.aggregate([
            { $match: match },
            {
                $group: {
                    _id: null,
                    totalRevenue: { $sum: '$revenue' },
                    totalOrders: { $sum: 1 },
                    customerIds: { $addToSet: '$customerId' },
                },
            },
            {
                $project: {
                    _id: 0,
                    totalRevenue: 1,
                    totalOrders: 1,
                    totalCustomers: { $size: '$customerIds' },
                },
            },
        ]);

        const summary = summaryAgg[0] || {
            totalRevenue: 0,
            totalOrders: 0,
            totalCustomers: 0,
        };

        // 2) Bảng dịch vụ: group theo serviceId → totalRevenue, totalOrders; lookup service name
        const serviceReport = await ServiceDetail.aggregate([
            { $match: match },
            {
                $group: {
                    _id: '$serviceId',
                    totalRevenue: { $sum: '$revenue' },
                    totalOrders: { $sum: 1 },
                },
            },
            {
                $lookup: {
                    from: 'services',
                    localField: '_id',
                    foreignField: '_id',
                    as: 'serviceDoc',
                },
            },
            { $unwind: { path: '$serviceDoc', preserveNullAndEmptyArrays: true } },
            {
                $project: {
                    serviceId: '$_id',
                    serviceName: '$serviceDoc.name',
                    totalRevenue: 1,
                    totalOrders: 1,
                    _id: 0,
                },
            },
            { $sort: { totalOrders: -1 } },
            { $limit: 100 },
        ]);

        // 3) Top dịch vụ = dịch vụ có số đơn (người sử dụng) nhiều nhất
        const topByOrders = serviceReport[0] || null;
        const topServiceName = topByOrders?.serviceName ?? '—';

        return NextResponse.json({
            success: true,
            summary: {
                ...summary,
                topService: topServiceName,
            },
            services: serviceReport,
        });
    } catch (error) {
        console.error('[API report/revenue]', error);
        return NextResponse.json(
            { success: false, error: error?.message || 'Lỗi báo cáo doanh thu' },
            { status: 500 }
        );
    }
}
