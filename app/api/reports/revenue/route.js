import { NextResponse } from 'next/server';
import connectDB from '@/config/connectDB';
import ServiceDetail from '@/models/service_details.model';

const SERVICE_TYPES = ['noi_khoa', 'ngoai_khoa', 'da_lieu'];

/**
 * Báo cáo doanh thu - nguồn: service_details (đơn completed + approved).
 * Query: from, to (mặc định = đầu tháng ~ cuối tháng hiện tại), type (tùy chọn: noi_khoa | ngoai_khoa | da_lieu).
 * Trả về: summary, topService, services, serviceGroups, orders.
 */
export async function GET(req) {
    try {
        await connectDB();

        const { searchParams } = new URL(req.url);
        const fromParam = searchParams.get('from');
        const toParam = searchParams.get('to');
        const typeParam = searchParams.get('type');
        const serviceTypeFilter =
            typeParam && SERVICE_TYPES.includes(typeParam) ? typeParam : null;
        const typeMatchAfterLookup = serviceTypeFilter
            ? [{ $match: { 'serviceDoc.type': serviceTypeFilter } }]
            : [];

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
                $lookup: {
                    from: 'services',
                    localField: 'serviceId',
                    foreignField: '_id',
                    as: 'serviceDoc',
                },
            },
            { $unwind: { path: '$serviceDoc', preserveNullAndEmptyArrays: true } },
            ...typeMatchAfterLookup,
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
            ...typeMatchAfterLookup,
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

        // 4) Nhóm theo loại dịch vụ (type): tổng doanh thu, số đơn, số KH distinct
        const serviceGroupsRaw = await ServiceDetail.aggregate([
            { $match: match },
            {
                $lookup: {
                    from: 'services',
                    localField: 'serviceId',
                    foreignField: '_id',
                    as: 'serviceDoc',
                },
            },
            { $unwind: { path: '$serviceDoc', preserveNullAndEmptyArrays: false } },
            ...typeMatchAfterLookup,
            {
                $group: {
                    _id: '$serviceDoc.type',
                    totalRevenue: { $sum: '$revenue' },
                    totalOrders: { $sum: 1 },
                    customerIds: { $addToSet: '$customerId' },
                },
            },
            { $match: { _id: { $in: SERVICE_TYPES } } },
            {
                $project: {
                    _id: 0,
                    type: '$_id',
                    totalRevenue: 1,
                    totalOrders: 1,
                    totalCustomers: { $size: '$customerIds' },
                },
            },
        ]);

        const typeOrder = { noi_khoa: 0, ngoai_khoa: 1, da_lieu: 2 };
        serviceGroupsRaw.sort(
            (a, b) => (typeOrder[a.type] ?? 99) - (typeOrder[b.type] ?? 99)
        );

        // 5) Bảng đơn theo khách hàng:
        // - thời gian khách lên đơn = thời điểm tạo đơn sớm nhất trong kỳ (firstOrderAt)
        // - loại khách = customer.customerType ('old' => Khách cũ, ngược lại Khách mới)
        // - doanh thu tổng các đơn + số lượng đơn trong kỳ
        // - dịch vụ = danh sách dịch vụ phát sinh trong kỳ
        const ordersReport = await ServiceDetail.aggregate([
            { $match: match },
            {
                $lookup: {
                    from: 'services',
                    localField: 'serviceId',
                    foreignField: '_id',
                    as: 'serviceDoc',
                },
            },
            { $unwind: { path: '$serviceDoc', preserveNullAndEmptyArrays: true } },
            ...typeMatchAfterLookup,
            {
                $group: {
                    _id: '$customerId',
                    firstOrderAt: { $min: '$createdAt' },
                    totalRevenue: { $sum: '$revenue' },
                    totalOrders: { $sum: 1 },
                    services: { $addToSet: '$serviceDoc.name' },
                },
            },
            {
                $lookup: {
                    from: 'customers',
                    localField: '_id',
                    foreignField: '_id',
                    as: 'customerDoc',
                },
            },
            { $unwind: { path: '$customerDoc', preserveNullAndEmptyArrays: true } },
            {
                $lookup: {
                    from: 'forms',
                    localField: 'customerDoc.source',
                    foreignField: '_id',
                    as: 'sourceDoc',
                },
            },
            { $unwind: { path: '$sourceDoc', preserveNullAndEmptyArrays: true } },
            {
                $project: {
                    _id: 0,
                    orderTime: '$firstOrderAt',
                    customerType: {
                        $cond: [{ $eq: ['$customerDoc.customerType', 'old'] }, 'Khách cũ', 'Khách mới'],
                    },
                    customerCode: { $ifNull: ['$customerDoc.customerCode', '—'] },
                    customerName: { $ifNull: ['$customerDoc.name', '—'] },
                    sourceName: {
                        $ifNull: ['$sourceDoc.name', { $ifNull: ['$customerDoc.sourceDetails', '—'] }],
                    },
                    services: {
                        $filter: {
                            input: '$services',
                            as: 'serviceName',
                            cond: { $and: [{ $ne: ['$$serviceName', null] }, { $ne: ['$$serviceName', ''] }] },
                        },
                    },
                    totalRevenue: 1,
                    totalOrders: 1,
                },
            },
            { $sort: { orderTime: -1 } },
            { $limit: 200 },
        ]);

        return NextResponse.json({
            success: true,
            summary: {
                ...summary,
                topService: topServiceName,
            },
            services: serviceReport,
            serviceGroups: serviceGroupsRaw,
            orders: ordersReport,
        });
    } catch (error) {
        console.error('[API report/revenue]', error);
        return NextResponse.json(
            { success: false, error: error?.message || 'Lỗi báo cáo doanh thu' },
            { status: 500 }
        );
    }
}
