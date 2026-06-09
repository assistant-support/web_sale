'use server';

import connectDB from '@/config/connectDB';
import ServiceDetail from '@/models/service_details.model';
import Customer from '@/models/customer.model';
import mongoose from 'mongoose';
import { unstable_cache as nextCache } from 'next/cache';
import { buildCustomerSourceFilter, mapCustomerSourceFilterToServiceDetail } from '@/utils/customerSourceFilter';

/** Sale chỉ xem đơn do mình tạo (createdBy) hoặc chốt (closedBy). */
function applySaleServiceDetailScope(query, saleUserId) {
    if (!saleUserId) return;
    if (!mongoose.Types.ObjectId.isValid(String(saleUserId))) {
        query._id = { $in: [] };
        return;
    }
    const saleOid = new mongoose.Types.ObjectId(String(saleUserId));
    const clause = { $or: [{ createdBy: saleOid }, { closedBy: saleOid }] };
    if (Array.isArray(query.$and)) {
        query.$and.push(clause);
    } else {
        query.$and = [clause];
    }
}

async function applyServiceDetailSourceFilter(query, sourceId) {
    if (!sourceId || sourceId === 'all') return;
    const customerSourceFilter = await buildCustomerSourceFilter(sourceId);
    const mapped = mapCustomerSourceFilterToServiceDetail(customerSourceFilter);
    if (!mapped) return;
    if (mapped.$or) {
        query.$and = [...(query.$and || []), mapped];
    } else {
        Object.assign(query, mapped);
    }
}

const PENDING_DETAIL_POPULATE = [
    { path: 'customerId', select: 'name phone assignees tags source' },
    { path: 'serviceId', select: 'name code price' },
    { path: 'sourceId', select: 'name' },
    { path: 'createdBy', select: 'name avt' },
    { path: 'approvedBy', select: 'name avt' },
    { path: 'closedBy', select: 'name avt' },
    { path: 'payments.receivedBy', select: 'name avt' },
    { path: 'commissions.user', select: 'name avt' },
    { path: 'costs.createdBy', select: 'name avt' },
];

function parseRangeStart(fromDate) {
    if (typeof fromDate === 'string' && !fromDate.includes('T')) {
        return new Date(fromDate + 'T00:00:00.000Z');
    }
    if (fromDate instanceof Date) {
        const from = new Date(fromDate);
        from.setUTCHours(0, 0, 0, 0);
        return from;
    }
    const from = new Date(fromDate);
    from.setHours(0, 0, 0, 0);
    return from;
}

function parseRangeEndExclusive(toDate) {
    if (typeof toDate === 'string' && !toDate.includes('T')) {
        const to = new Date(toDate + 'T00:00:00.000Z');
        to.setUTCDate(to.getUTCDate() + 1);
        return to;
    }
    if (toDate instanceof Date) {
        const to = new Date(toDate);
        to.setUTCDate(to.getUTCDate() + 1);
        to.setUTCHours(0, 0, 0, 0);
        return to;
    }
    const to = new Date(toDate);
    to.setDate(to.getDate() + 1);
    to.setHours(0, 0, 0, 0);
    return to;
}

/** Lọc theo ngày duyệt (ưu tiên) → ngày chốt → ngày tạo. */
function applyApprovedDealsEffectiveDateRange(query, fromDate, toDate) {
    if (!fromDate && !toDate) return;

    const effectiveDate = { $ifNull: ['$approvedAt', { $ifNull: ['$closedAt', '$createdAt'] }] };
    const conditions = [];
    if (fromDate) {
        conditions.push({ $gte: [effectiveDate, parseRangeStart(fromDate)] });
    }
    if (toDate) {
        conditions.push({ $lt: [effectiveDate, parseRangeEndExclusive(toDate)] });
    }
    const dateExpr = conditions.length === 1 ? conditions[0] : { $and: conditions };

    if (Array.isArray(query.$and)) {
        query.$and.push({ $expr: dateExpr });
    } else if (query.$expr) {
        query.$and = [{ $expr: query.$expr }, { $expr: dateExpr }];
        delete query.$expr;
    } else {
        query.$expr = dateExpr;
    }
}

function applyPendingCreatedAtRange(query, fromDate, toDate) {
    if (!fromDate && !toDate) return;
    query.createdAt = {};
    if (fromDate) {
        if (typeof fromDate === 'string' && !fromDate.includes('T')) {
            query.createdAt.$gte = new Date(fromDate + 'T00:00:00.000Z');
        } else if (fromDate instanceof Date) {
            const from = new Date(fromDate);
            from.setUTCHours(0, 0, 0, 0);
            query.createdAt.$gte = from;
        } else {
            const from = new Date(fromDate);
            from.setHours(0, 0, 0, 0);
            query.createdAt.$gte = from;
        }
    }
    if (toDate) {
        if (typeof toDate === 'string' && !toDate.includes('T')) {
            const to = new Date(toDate + 'T00:00:00.000Z');
            to.setUTCDate(to.getUTCDate() + 1);
            query.createdAt.$lt = to;
        } else if (toDate instanceof Date) {
            const to = new Date(toDate);
            to.setUTCDate(to.getUTCDate() + 1);
            to.setUTCHours(0, 0, 0, 0);
            query.createdAt.$lt = to;
        } else {
            const to = new Date(toDate);
            to.setDate(to.getDate() + 1);
            to.setHours(0, 0, 0, 0);
            query.createdAt.$lt = to;
        }
    }
}

async function buildPendingServiceDetailQuery(params = {}) {
    const { fromDate, toDate, sourceId, serviceId, saleUserId } = params;
    const query = { approvalStatus: 'pending' };

    applySaleServiceDetailScope(query, saleUserId);
    await applyServiceDetailSourceFilter(query, sourceId);

    if (serviceId && serviceId !== 'all') {
        query.serviceId = serviceId;
    }

    applyPendingCreatedAtRange(query, fromDate, toDate);
    return query;
}

function transformPendingDetailToRow(detail) {
    const customer = detail.customerId || {};
    return {
        customerId: customer._id || detail.customerId,
        name: customer.name || '',
        phone: customer.phone || '',
        assignees: customer.assignees || [],
        tags: customer.tags || [],
        care: [],
        detail: {
            _id: detail._id,
            approvalStatus: detail.approvalStatus,
            status: detail.status,
            notes: detail.notes,
            selectedService: detail.serviceId,
            serviceId: detail.serviceId,
            pricing: detail.pricing,
            revenue: detail.revenue,
            payments: detail.payments || [],
            commissions: detail.commissions || [],
            costs: detail.costs || [],
            amountReceivedTotal: detail.amountReceivedTotal,
            outstandingAmount: detail.outstandingAmount,
            closedAt: detail.closedAt,
            closedBy: detail.closedBy,
            approvedAt: detail.approvedAt,
            approvedBy: detail.approvedBy,
            createdAt: detail.createdAt,
            createdBy: detail.createdBy,
            invoiceDriveIds: detail.invoiceDriveIds || [],
            customerPhotosDriveIds: detail.customerPhotosDriveIds || [],
            selectedCourse: detail.selectedCourse,
            interestedServices: detail.interestedServices || [],
            sourceId: detail.sourceId,
            sourceDetails: detail.sourceDetails,
        },
    };
}

/**
 * Lấy danh sách đơn chờ duyệt từ service_details với filter thời gian và pagination
 */
export async function getPendingApprovals(params = {}) {
    try {
        await connectDB();

        const { limit = 10, skip = 0 } = params;
        const query = await buildPendingServiceDetailQuery(params);
        const total = await ServiceDetail.countDocuments(query);

        const pendingDetails = await ServiceDetail.find(query)
            .populate(PENDING_DETAIL_POPULATE)
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit)
            .lean();

        const transformed = pendingDetails.map(transformPendingDetailToRow);

        return {
            data: JSON.parse(JSON.stringify(transformed)),
            total,
        };
    } catch (error) {
        console.error('Error in getPendingApprovals:', error);
        return { data: [], total: 0 };
    }
}

/**
 * Danh sách chờ duyệt nhóm theo khách hàng (mỗi dòng = 1 khách).
 */
export async function getPendingApprovalsGroupedByCustomer(params = {}) {
    try {
        await connectDB();

        const { limit = 10, skip = 0 } = params;
        const query = await buildPendingServiceDetailQuery(params);

        const aggResult = await ServiceDetail.aggregate([
            { $match: query },
            {
                $group: {
                    _id: '$customerId',
                    latestCreatedAt: { $max: '$createdAt' },
                    orderCount: { $sum: 1 },
                    totalListPrice: { $sum: { $ifNull: ['$pricing.listPrice', 0] } },
                },
            },
            { $sort: { latestCreatedAt: -1 } },
            {
                $facet: {
                    data: [{ $skip: skip }, { $limit: limit }],
                    meta: [{ $count: 'total' }],
                },
            },
        ]);

        const groups = aggResult[0]?.data || [];
        const total = aggResult[0]?.meta[0]?.total || 0;

        if (groups.length === 0) {
            return { data: [], total: 0 };
        }

        const customerIds = groups
            .map((g) => g._id)
            .filter((id) => id && mongoose.Types.ObjectId.isValid(String(id)));

        const [customers, allOrders] = await Promise.all([
            Customer.find({ _id: { $in: customerIds } })
                .select('name phone assignees tags')
                .lean(),
            ServiceDetail.find({ ...query, customerId: { $in: customerIds } })
                .populate(PENDING_DETAIL_POPULATE)
                .sort({ createdAt: -1 })
                .lean(),
        ]);

        const customerMap = new Map(customers.map((c) => [String(c._id), c]));
        const ordersByCustomer = new Map();

        for (const detail of allOrders) {
            const cid = String(detail.customerId?._id || detail.customerId);
            if (!ordersByCustomer.has(cid)) ordersByCustomer.set(cid, []);
            ordersByCustomer.get(cid).push(transformPendingDetailToRow(detail));
        }

        const data = groups.map((g) => {
            const cid = String(g._id);
            const customer = customerMap.get(cid) || {};
            const orders = ordersByCustomer.get(cid) || [];
            const first = orders[0];
            return {
                customerId: cid,
                name: customer.name || first?.name || '',
                phone: customer.phone || first?.phone || '',
                assignees: customer.assignees || first?.assignees || [],
                tags: customer.tags || first?.tags || [],
                latestCreatedAt: g.latestCreatedAt,
                orderCount: g.orderCount,
                totalListPrice: g.totalListPrice,
                orders,
            };
        });

        return {
            data: JSON.parse(JSON.stringify(data)),
            total,
        };
    } catch (error) {
        console.error('Error in getPendingApprovalsGroupedByCustomer:', error);
        return { data: [], total: 0 };
    }
}

/**
 * Lấy danh sách đơn đã duyệt từ service_details với filter và pagination
 * @param {Object} params - Tham số filter
 * @param {Date|string} params.fromDate - Ngày bắt đầu (optional)
 * @param {Date|string} params.toDate - Ngày kết thúc (optional)
 * @param {string} params.sourceId - ID nguồn (optional)
 * @param {string} params.serviceId - ID dịch vụ (optional)
 * @param {number} params.limit - Số lượng đơn cần lấy (default: 10)
 * @param {number} params.skip - Số lượng đơn cần bỏ qua (default: 0)
 * @returns {Promise<{data: Array, total: number}>} Danh sách đơn đã duyệt với thông tin customer đầy đủ và tổng số
 */
export async function getApprovedDeals(params = {}) {
    try {
        await connectDB();
        
        const { fromDate, toDate, sourceId, serviceId, limit = 10, skip = 0, saleUserId } = params;
        
        // Build query - chỉ lấy đơn đã duyệt và hoàn thành
        const query = {
            status: 'completed',
            approvalStatus: 'approved'
        };

        applySaleServiceDetailScope(query, saleUserId);
        
        await applyServiceDetailSourceFilter(query, sourceId);
        
        // Filter theo dịch vụ
        if (serviceId && serviceId !== 'all') {
            query.serviceId = serviceId;
        }
        
        // Filter theo thời gian: ưu tiên approvedAt (ngày duyệt) để đơn vừa duyệt hiện đúng khoảng lọc
        applyApprovedDealsEffectiveDateRange(query, fromDate, toDate);
        
        // Đếm tổng số đơn phù hợp
        const total = await ServiceDetail.countDocuments(query);
        
        // Query từ service_details với pagination
        const approvedDetails = await ServiceDetail.find(query)
            .populate('customerId', 'name phone assignees tags source care')
            .populate('serviceId', 'name code price')
            .populate('sourceId', 'name')
            .populate('createdBy', 'name avt')
            .populate('approvedBy', 'name avt')
            .populate('closedBy', 'name avt')
            .populate('payments.receivedBy', 'name avt')
            .populate('commissions.user', 'name avt')
            .populate('costs.createdBy', 'name avt')
            .sort({ approvedAt: -1, closedAt: -1, createdAt: -1 })
            .skip(skip)
            .limit(limit)
            .lean();
        
        // Transform data để tương thích với format hiện tại
        const transformed = approvedDetails.map(detail => {
            const customer = detail.customerId || {};
            return {
                customerId: customer._id || detail.customerId,
                name: customer.name || '',
                phone: customer.phone || '',
                assignees: customer.assignees || [],
                tags: customer.tags || [],
                care: customer.care || [],
                detail: {
                    _id: detail._id,
                    approvalStatus: detail.approvalStatus,
                    status: detail.status,
                    notes: detail.notes,
                    selectedService: detail.serviceId,
                    pricing: detail.pricing,
                    revenue: detail.revenue,
                    payments: detail.payments || [],
                    commissions: detail.commissions || [],
                    costs: detail.costs || [],
                    amountReceivedTotal: detail.amountReceivedTotal,
                    outstandingAmount: detail.outstandingAmount,
                    closedAt: detail.closedAt,
                    closedBy: detail.closedBy,
                    approvedAt: detail.approvedAt,
                    approvedBy: detail.approvedBy,
                    createdAt: detail.createdAt,
                    createdBy: detail.createdBy,
                    invoiceDriveIds: detail.invoiceDriveIds || [],
                    customerPhotosDriveIds: detail.customerPhotosDriveIds || [],
                    selectedCourse: detail.selectedCourse,
                    interestedServices: detail.interestedServices || [],
                    sourceId: detail.sourceId,
                    sourceDetails: detail.sourceDetails,
                }
            };
        });
        
        return {
            data: JSON.parse(JSON.stringify(transformed)),
            total
        };
    } catch (error) {
        console.error('Error in getApprovedDeals:', error);
        // Fallback: trả về mảng rỗng nếu có lỗi
        return { data: [], total: 0 };
    }
}

