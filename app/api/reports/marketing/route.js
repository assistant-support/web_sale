import { NextResponse } from 'next/server';
import connectDB from '@/config/connectDB';
import Customer from '@/models/customer.model';
import Appointment from '@/models/appointment.model';
import ServiceDetail from '@/models/service_details.model';
import MarketingCost from '@/models/marketingCost.model';
import Form from '@/models/formclient';

/**
 * Báo cáo marketing theo kênh (nguồn).
 * - Lead: customers (createAt trong khoảng), group theo source/sourceDetails
 * - Booking: appointments (status != cancelled), group theo customer.source
 * - Hoàn thành + Doanh thu: service_details (completed, approved, closedAt), group theo sourceId/sourceDetails
 * - Chi phí: marketing_costs (trùng khoảng ngày), group theo source
 * - ROI = (Revenue - Cost) / Cost * 100
 */
export async function GET(req) {
    try {
        await connectDB();

        const { searchParams } = new URL(req.url);
        const fromParam = searchParams.get('from');
        const toParam = searchParams.get('to');
        const hasRange = !!fromParam && !!toParam;

        let fromDate = null;
        let toDate = null;
        if (hasRange) {
            fromDate = new Date(fromParam + 'T00:00:00');
            toDate = new Date(toParam + 'T23:59:59.999');
        }

        // 1) Danh sách kênh: forms + message sources (sourceDetails từ Customer)
        const forms = await Form.find({}).select('_id name').lean();
        const allSourceDetails = await Customer.distinct('sourceDetails', {
            sourceDetails: { $exists: true, $ne: null, $ne: '' },
        });
        const messageSourceDetails = allSourceDetails
            .filter((s) => {
                if (!s || !String(s).trim()) return false;
                const t = String(s).trim();
                return t.startsWith('Tin nhắn - ') && t.split(' - ').length >= 3;
            })
            .map((s) => String(s).trim());

        const channels = [
            ...forms.map((f) => ({ _id: f._id, name: f.name, key: String(f._id) })),
            ...messageSourceDetails.map((s) => ({ _id: s, name: s, key: s })),
        ];

        // 2) Lead: tổng số khách theo kênh TRONG KHOẢNG NGÀY (mặc định: tháng hiện tại)
        // - Kênh form: group theo customer.source
        // - Kênh tin nhắn: group theo customer.sourceDetails
        const leadSourcePipeline = [];
        if (hasRange) {
            leadSourcePipeline.push({
                $match: {
                    createAt: { $gte: fromDate, $lte: toDate },
                },
            });
        }
        leadSourcePipeline.push({
            $group: {
                _id: '$source',
                totalLead: { $sum: 1 },
            },
        });
        const leadBySourceAgg = await Customer.aggregate(leadSourcePipeline);

        const leadSourceDetailsPipeline = [];
        const sourceDetailsMatch = {
            sourceDetails: { $exists: true, $ne: null, $ne: '' },
        };
        if (hasRange) {
            sourceDetailsMatch.createAt = { $gte: fromDate, $lte: toDate };
        }
        leadSourceDetailsPipeline.push({ $match: sourceDetailsMatch });
        leadSourceDetailsPipeline.push({
            $group: {
                _id: '$sourceDetails',
                totalLead: { $sum: 1 },
            },
        });
        const leadBySourceDetailsAgg = await Customer.aggregate(leadSourceDetailsPipeline);
        const leadsByKey = {};
        leadBySourceAgg.forEach((r) => {
            const k = r._id ? String(r._id) : '';
            if (k) leadsByKey[k] = r.totalLead;
        });
        leadBySourceDetailsAgg.forEach((r) => {
            const k = r._id ? String(r._id) : '';
            if (k) leadsByKey[k] = r.totalLead;
        });

        // 3) Booking: appointments, status != cancelled, lookup customer, group theo source key
        const bookingMatch = {
            status: { $ne: 'cancelled' },
        };
        if (hasRange) {
            bookingMatch.appointmentDate = { $gte: fromDate, $lte: toDate };
        }
        const bookingAgg = await Appointment.aggregate([
            {
                $match: bookingMatch,
            },
            { $lookup: { from: 'customers', localField: 'customer', foreignField: '_id', as: 'cust' } },
            { $unwind: { path: '$cust', preserveNullAndEmptyArrays: true } },
            {
                $group: {
                    _id: {
                        $cond: [
                            { $and: [{ $ne: ['$cust.source', null] }, { $ne: ['$cust.source', undefined] }] },
                            { $toString: '$cust.source' },
                            '$cust.sourceDetails',
                        ],
                    },
                    totalBooking: { $sum: 1 },
                },
            },
        ]);
        const bookingsByKey = {};
        bookingAgg.forEach((r) => {
            const k = r._id != null ? String(r._id) : '';
            if (k) bookingsByKey[k] = r.totalBooking;
        });

        // 4) Hoàn thành + Doanh thu: service_details (completed, approved, closedAt)
        const completedMatch = {
            status: 'completed',
            approvalStatus: 'approved',
        };
        if (hasRange) {
            completedMatch.closedAt = { $gte: fromDate, $lte: toDate };
        }
        const completedAgg = await ServiceDetail.aggregate([
            {
                $match: completedMatch,
            },
            {
                $group: {
                    _id: {
                        $cond: [
                            { $and: [{ $ne: ['$sourceId', null] }, { $ne: ['$sourceId', undefined] }] },
                            { $toString: '$sourceId' },
                            '$sourceDetails',
                        ],
                    },
                    totalCompleted: { $sum: 1 },
                    totalRevenue: { $sum: '$revenue' },
                },
            },
        ]);
        const completedByKey = {};
        completedAgg.forEach((r) => {
            const k = r._id != null ? String(r._id) : '';
            if (k) completedByKey[k] = { totalCompleted: r.totalCompleted, totalRevenue: r.totalRevenue || 0 };
        });

        // 5) Chi phí marketing: costs có [startDate,endDate] giao với [fromDate, toDate], group theo source / messageSourceKey
        const costQuery = hasRange
            ? {
                startDate: { $lte: toDate },
                endDate: { $gte: fromDate },
            }
            : {};

        const costs = await MarketingCost.find(costQuery)
            .select('channelType source messageSourceKey amount')
            .lean();

        const costByKey = {};
        costs.forEach((c) => {
            const key =
                c.channelType === 'message'
                    ? (c.messageSourceKey ? String(c.messageSourceKey) : null)
                    : (c.source ? String(c.source) : null);
            if (key) {
                costByKey[key] = (costByKey[key] || 0) + (Number(c.amount) || 0);
            }
        });

        // 6) Merge theo kênh
        let totalRevenue = 0;
        let totalCost = 0;
        const report = channels.map((ch) => {
            const key = ch.key;
            const lead = leadsByKey[key] || 0;
            const booking = bookingsByKey[key] || 0;
            const comp = completedByKey[key];
            const completed = comp ? comp.totalCompleted : 0;
            const revenue = comp ? comp.totalRevenue : 0;
            const cost = costByKey[key] || 0;
            totalRevenue += revenue;
            totalCost += cost;
            const roi = cost > 0 ? (((revenue - cost) / cost) * 100) : 0;
            return {
                channel: ch.name,
                sourceId: ch._id,
                lead,
                booking,
                completed,
                revenue,
                cost,
                roi: Number(roi.toFixed(2)),
            };
        });

        const roiTotal = totalCost > 0 ? (((totalRevenue - totalCost) / totalCost) * 100) : 0;

        return NextResponse.json({
            success: true,
            summary: {
                totalRevenue,
                totalCost,
                roi: Number(roiTotal.toFixed(2)),
            },
            channels: report,
        });
    } catch (error) {
        console.error('[API report/marketing]', error);
        return NextResponse.json(
            { success: false, error: error?.message || 'Lỗi báo cáo marketing' },
            { status: 500 }
        );
    }
}
