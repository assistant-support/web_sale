import mongoose from 'mongoose';
import connectDB from '@/config/connectDB';
import ServiceDetail from '@/models/service_details.model';
import MarketingCost from '@/models/marketingCost.model';
import OperationalCost from '@/models/operationalCost.model';
import FinancialReport from '@/models/financialReport.model';

function getMonthRange(year, month) {
    const start = new Date(year, month - 1, 1, 0, 0, 0, 0);
    const endExclusive = new Date(year, month, 1, 0, 0, 0, 0);
    return { start, endExclusive };
}

export async function rebuildFinancialReportForMonth(year, month) {
    await connectDB();
    const { start, endExclusive } = getMonthRange(year, month);

    // 1) Doanh thu theo serviceId từ service_details
    const revenueAgg = await ServiceDetail.aggregate([
        {
            $match: {
                closedAt: { $gte: start, $lt: endExclusive },
                status: 'completed',
                approvalStatus: 'approved',
            },
        },
        {
            $group: {
                _id: '$serviceId',
                revenue: { $sum: '$revenue' },
            },
        },
    ]);

    if (!revenueAgg.length) {
        await FinancialReport.deleteMany({ year, month });
        return;
    }

    const revenueByService = new Map();
    let totalRevenue = 0;
    revenueAgg.forEach((r) => {
        const key = String(r._id);
        const value = Number(r.revenue || 0);
        revenueByService.set(key, value);
        totalRevenue += value;
    });

    // 2) Chi phí marketing toàn tháng
    const marketingAgg = await MarketingCost.aggregate([
        {
            $match: {
                startDate: { $lte: endExclusive },
                endDate: { $gte: start },
            },
        },
        {
            $group: {
                _id: null,
                totalMarketingCost: { $sum: '$amount' },
            },
        },
    ]);
    const totalMarketingCost = marketingAgg[0]?.totalMarketingCost || 0;

    // 3) Chi phí vận hành theo serviceId
    const opAgg = await OperationalCost.aggregate([
        {
            $match: {
                date: { $gte: start, $lt: endExclusive },
            },
        },
        {
            $group: {
                _id: '$serviceId',
                totalAmount: { $sum: '$amount' },
            },
        },
    ]);

    const opByService = new Map();
    opAgg.forEach((r) => {
        const key = r._id ? String(r._id) : null;
        const value = Number(r.totalAmount || 0);
        if (key) opByService.set(key, value);
    });

    const serviceKeys = new Set();
    revenueByService.forEach((_v, k) => serviceKeys.add(k));
    opByService.forEach((_v, k) => serviceKeys.add(k));

    const now = new Date();
    const bulkOps = [];
    serviceKeys.forEach((key) => {
        const revenue = revenueByService.get(key) || 0;
        const marketingCost =
            totalMarketingCost > 0 && totalRevenue > 0 && revenue > 0
                ? (totalMarketingCost * revenue) / totalRevenue
                : 0;
        const operationalCost = opByService.get(key) || 0;
        const totalCost = marketingCost + operationalCost;
        const profit = revenue - totalCost;
        const margin = revenue > 0 ? (profit / revenue) * 100 : 0;

        bulkOps.push({
            updateOne: {
                filter: {
                    serviceId: new mongoose.Types.ObjectId(key),
                    year,
                    month,
                },
                update: {
                    $set: {
                        serviceId: new mongoose.Types.ObjectId(key),
                        year,
                        month,
                        revenue,
                        marketingCost,
                        operationalCost,
                        totalCost,
                        profit,
                        margin,
                        updatedAt: now,
                    },
                },
                upsert: true,
            },
        });
    });

    if (bulkOps.length) {
        await FinancialReport.bulkWrite(bulkOps);
    }
}

export async function rebuildAllFinancialReports() {
    await connectDB();
    const monthsAgg = await ServiceDetail.aggregate([
        {
            $match: {
                closedAt: { $ne: null },
                status: 'completed',
                approvalStatus: 'approved',
            },
        },
        {
            $group: {
                _id: {
                    year: { $year: '$closedAt' },
                    month: { $month: '$closedAt' },
                },
            },
        },
    ]);

    for (const doc of monthsAgg) {
        const { year, month } = doc._id;
        await rebuildFinancialReportForMonth(year, month);
    }
}

