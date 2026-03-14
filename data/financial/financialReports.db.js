import mongoose from 'mongoose';
import connectDB from '@/config/connectDB';
import ServiceDetail from '@/models/service_details.model';
import MarketingCost from '@/models/marketingCost.model';
import OperationalCost from '@/models/operationalCost.model';
import FinancialReport from '@/models/financialReport.model';
import FinancialReportDaily from '@/models/financialReportDaily.model';
import Service from '@/models/services.model';

function getMonthRange(year, month) {
    const start = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0, 0));
    const endExclusive = new Date(Date.UTC(year, month, 1, 0, 0, 0, 0));
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
    let totalNullOp = 0;
    opAgg.forEach((r) => {
        const key = r._id ? String(r._id) : null;
        const value = Number(r.totalAmount || 0);
        if (key) opByService.set(key, value);
        else totalNullOp += value;
    });

    let serviceKeys = new Set();
    revenueByService.forEach((_v, k) => serviceKeys.add(k));
    opByService.forEach((_v, k) => serviceKeys.add(k));
    if (serviceKeys.size === 0 && totalNullOp > 0) {
        const allSvc = await Service.find({}).select('_id').lean();
        allSvc.forEach((s) => serviceKeys.add(String(s._id)));
    }
    if (serviceKeys.size === 0) {
        await FinancialReport.deleteMany({ year, month });
        return;
    }

    const nullOpPerService = serviceKeys.size > 0 ? totalNullOp / serviceKeys.size : 0;
    const now = new Date();
    const bulkOps = [];
    serviceKeys.forEach((key) => {
        const revenue = revenueByService.get(key) || 0;
        const marketingCost =
            totalMarketingCost > 0 && totalRevenue > 0 && revenue > 0
                ? (totalMarketingCost * revenue) / totalRevenue
                : 0;
        const operationalCost = (opByService.get(key) || 0) + nullOpPerService;
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
    const [revenueMonths, opMonths] = await Promise.all([
        ServiceDetail.aggregate([
            {
                $match: {
                    closedAt: { $ne: null },
                    status: 'completed',
                    approvalStatus: 'approved',
                },
            },
            { $group: { _id: { year: { $year: '$closedAt' }, month: { $month: '$closedAt' } } } },
        ]),
        OperationalCost.aggregate([
            { $match: { date: { $ne: null } } },
            { $group: { _id: { year: { $year: '$date' }, month: { $month: '$date' } } } },
        ]),
    ]);
    const seen = new Set();
    const toRebuild = [];
    for (const doc of revenueMonths) {
        const { year, month } = doc._id;
        const key = `${year}-${month}`;
        if (!seen.has(key)) {
            seen.add(key);
            toRebuild.push({ year, month });
        }
    }
    for (const doc of opMonths) {
        const { year, month } = doc._id;
        const key = `${year}-${month}`;
        if (!seen.has(key)) {
            seen.add(key);
            toRebuild.push({ year, month });
        }
    }
    for (const { year, month } of toRebuild) {
        await rebuildFinancialReportForMonth(year, month);
    }
}

/**
 * Báo cáo tài chính theo khoảng ngày (from/to). Dùng khi filter theo ngày.
 * Aggregate trực tiếp từ service_details, marketing_costs, operational_costs.
 */
export async function getFinancialReportForDateRange(fromDateStr, toDateStr) {
    await connectDB();

    const fromDate = new Date(fromDateStr + 'T00:00:00.000Z');
    const toDate = new Date(toDateStr + 'T23:59:59.999Z');

    // 1) Doanh thu theo serviceId từ service_details (closedAt trong khoảng)
    const revenueAgg = await ServiceDetail.aggregate([
        {
            $match: {
                closedAt: { $gte: fromDate, $lte: toDate },
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

    const revenueByService = new Map();
    let totalRevenue = 0;
    revenueAgg.forEach((r) => {
        const key = String(r._id);
        const value = Number(r.revenue || 0);
        revenueByService.set(key, value);
        totalRevenue += value;
    });

    // 2) Chi phí marketing: các bản ghi có khoảng [startDate,endDate] giao với [fromDate, toDate]
    const marketingAgg = await MarketingCost.aggregate([
        {
            $match: {
                startDate: { $lte: toDate },
                endDate: { $gte: fromDate },
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

    // 3) Chi phí vận hành: date nằm trong [fromDate, toDate], group theo serviceId
    const opAgg = await OperationalCost.aggregate([
        {
            $match: {
                date: { $gte: fromDate, $lte: toDate },
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
    let totalNullOpRange = 0;
    opAgg.forEach((r) => {
        const key = r._id ? String(r._id) : null;
        const value = Number(r.totalAmount || 0);
        if (key) opByService.set(key, value);
        else totalNullOpRange += value;
    });

    let serviceKeysRange = new Set();
    revenueByService.forEach((_v, k) => serviceKeysRange.add(k));
    opByService.forEach((_v, k) => serviceKeysRange.add(k));
    if (serviceKeysRange.size === 0 && totalNullOpRange > 0) {
        const allSvcR = await Service.find({}).select('_id').lean();
        allSvcR.forEach((s) => serviceKeysRange.add(String(s._id)));
    }
    const nullOpPerServiceRange = serviceKeysRange.size > 0 ? totalNullOpRange / serviceKeysRange.size : 0;

    const reportByServiceId = new Map();
    let totalCost = 0;
    let totalProfit = 0;
    serviceKeysRange.forEach((key) => {
        const revenue = revenueByService.get(key) || 0;
        const marketingCost =
            totalMarketingCost > 0 && totalRevenue > 0 && revenue > 0
                ? (totalMarketingCost * revenue) / totalRevenue
                : 0;
        const operationalCost = (opByService.get(key) || 0) + nullOpPerServiceRange;
        const rowTotalCost = marketingCost + operationalCost;
        const profit = revenue - rowTotalCost;
        const margin = revenue > 0 ? (profit / revenue) * 100 : 0;
        totalCost += rowTotalCost;
        totalProfit += profit;
        reportByServiceId.set(key, {
            revenue,
            cost: rowTotalCost,
            profit,
            margin: Number(margin.toFixed(2)),
        });
    });

    const allServices = await Service.find({}).select('_id name').sort({ name: 1 }).lean();
    const rows = allServices.map((s) => {
        const key = String(s._id);
        const r = reportByServiceId.get(key);
        if (r) {
            return {
                serviceId: key,
                serviceName: s.name || 'Không xác định',
                revenue: r.revenue,
                cost: r.cost,
                profit: r.profit,
                margin: r.margin,
            };
        }
        return {
            serviceId: key,
            serviceName: s.name || 'Không xác định',
            revenue: 0,
            cost: 0,
            profit: 0,
            margin: 0,
        };
    });

    const summaryMargin = totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0;
    return {
        summary: {
            totalRevenue,
            totalCost,
            profit: totalProfit,
            margin: Number(summaryMargin.toFixed(2)),
            marketingCost: totalMarketingCost,
            operationalCost: totalCost - totalMarketingCost,
        },
        rows,
    };
}

/** Trả về danh sách ngày (start of day) từ from đến to (bao gồm cả hai). */
function getDaysInRange(fromDateStr, toDateStr) {
    const from = new Date(fromDateStr + 'T00:00:00.000Z');
    const to = new Date(toDateStr + 'T00:00:00.000Z');
    const days = [];
    const cursor = new Date(from);
    cursor.setUTCHours(0, 0, 0, 0);
    const end = new Date(to);
    end.setUTCHours(0, 0, 0, 0);
    while (cursor <= end) {
        days.push(new Date(cursor));
        cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
    return days;
}

/**
 * Rebuild báo cáo daily cho từng ngày trong khoảng [fromDateStr, toDateStr].
 * Mỗi ngày: aggregate revenue theo serviceId, marketing (giao khoảng), operational theo serviceId,
 * phân bổ marketing theo tỷ lệ doanh thu, rồi upsert vào financial_reports_daily.
 */
export async function rebuildFinancialReportDailyForDateRange(fromDateStr, toDateStr) {
    await connectDB();
    const days = getDaysInRange(fromDateStr, toDateStr);
    const now = new Date();

    for (const dayStart of days) {
        const dayEnd = new Date(dayStart);
        dayEnd.setUTCHours(23, 59, 59, 999);
        const year = dayStart.getUTCFullYear();
        const month = dayStart.getUTCMonth() + 1;
        const day = dayStart.getUTCDate();

        const revenueAgg = await ServiceDetail.aggregate([
            {
                $match: {
                    closedAt: { $gte: dayStart, $lte: dayEnd },
                    status: 'completed',
                    approvalStatus: 'approved',
                },
            },
            { $group: { _id: '$serviceId', revenue: { $sum: '$revenue' } } },
        ]);
        const revenueByService = new Map();
        let totalRevenue = 0;
        revenueAgg.forEach((r) => {
            const key = String(r._id);
            const value = Number(r.revenue || 0);
            revenueByService.set(key, value);
            totalRevenue += value;
        });

        const marketingAgg = await MarketingCost.aggregate([
            {
                $match: {
                    startDate: { $lte: dayEnd },
                    endDate: { $gte: dayStart },
                },
            },
            { $group: { _id: null, totalMarketingCost: { $sum: '$amount' } } },
        ]);
        const totalMarketingCost = marketingAgg[0]?.totalMarketingCost || 0;

        const opAgg = await OperationalCost.aggregate([
            { $match: { date: { $gte: dayStart, $lte: dayEnd } } },
            { $group: { _id: '$serviceId', totalAmount: { $sum: '$amount' } } },
        ]);
        const opByService = new Map();
        let totalNullOpDay = 0;
        opAgg.forEach((r) => {
            const key = r._id ? String(r._id) : null;
            const val = Number(r.totalAmount || 0);
            if (key) opByService.set(key, val);
            else totalNullOpDay += val;
        });

        let serviceKeysDay = new Set();
        revenueByService.forEach((_v, k) => serviceKeysDay.add(k));
        opByService.forEach((_v, k) => serviceKeysDay.add(k));
        if (serviceKeysDay.size === 0 && totalNullOpDay > 0) {
            const allSvcDay = await Service.find({}).select('_id').lean();
            allSvcDay.forEach((s) => serviceKeysDay.add(String(s._id)));
        }

        const nullOpPerServiceDay = serviceKeysDay.size > 0 ? totalNullOpDay / serviceKeysDay.size : 0;
        const bulkOps = [];
        serviceKeysDay.forEach((key) => {
            const revenue = revenueByService.get(key) || 0;
            const marketingCost =
                totalMarketingCost > 0 && totalRevenue > 0 && revenue > 0
                    ? (totalMarketingCost * revenue) / totalRevenue
                    : 0;
            const operationalCost = (opByService.get(key) || 0) + nullOpPerServiceDay;
            const totalCost = marketingCost + operationalCost;
            const profit = revenue - totalCost;
            const margin = revenue > 0 ? (profit / revenue) * 100 : 0;
            bulkOps.push({
                updateOne: {
                    filter: {
                        date: dayStart,
                        serviceId: new mongoose.Types.ObjectId(key),
                    },
                    update: {
                        $set: {
                            date: dayStart,
                            serviceId: new mongoose.Types.ObjectId(key),
                            year,
                            month,
                            day,
                            revenue,
                            marketingCost,
                            operationalCost,
                            totalCost,
                            profit,
                            margin: Number(margin.toFixed(2)),
                            updatedAt: now,
                        },
                    },
                    upsert: true,
                },
            });
        });

        if (bulkOps.length) {
            await FinancialReportDaily.bulkWrite(bulkOps);
        }
    }
}


/**
 * Đọc báo cáo tài chính từ collection financial_reports_daily (theo khoảng ngày).
 * Trả về cùng format { summary, rows }. Nếu không có bản ghi daily trong khoảng thì trả về null để API fallback.
 */
export async function getFinancialReportFromDaily(fromDateStr, toDateStr) {
    await connectDB();
    const fromDate = new Date(fromDateStr + 'T00:00:00.000Z');
    const toDate = new Date(toDateStr + 'T23:59:59.999Z');

    const hasDaily = await FinancialReportDaily.countDocuments({
        date: { $gte: fromDate, $lte: toDate },
    });
    if (hasDaily === 0) return null;

    const agg = await FinancialReportDaily.aggregate([
        { $match: { date: { $gte: fromDate, $lte: toDate } } },
        {
            $group: {
                _id: '$serviceId',
                revenue: { $sum: '$revenue' },
                marketingCost: { $sum: '$marketingCost' },
                operationalCost: { $sum: '$operationalCost' },
                totalCost: { $sum: '$totalCost' },
                profit: { $sum: '$profit' },
            },
        },
    ]);

    const reportByServiceId = new Map();
    let totalRevenue = 0;
    let totalCost = 0;
    let totalProfit = 0;
    let totalMarketingCost = 0;
    let totalOperationalCost = 0;
    agg.forEach((r) => {
        const key = String(r._id);
        const revenue = Number(r.revenue || 0);
        const cost = Number(r.totalCost || 0);
        const profit = Number(r.profit || 0);
        totalRevenue += revenue;
        totalCost += cost;
        totalProfit += profit;
        totalMarketingCost += Number(r.marketingCost || 0);
        totalOperationalCost += Number(r.operationalCost || 0);
        const margin = revenue > 0 ? (profit / revenue) * 100 : 0;
        reportByServiceId.set(key, {
            revenue,
            cost,
            profit,
            margin: Number(margin.toFixed(2)),
        });
    });

    const allServices = await Service.find({}).select('_id name').sort({ name: 1 }).lean();
    const rows = allServices.map((s) => {
        const key = String(s._id);
        const r = reportByServiceId.get(key);
        if (r) {
            return {
                serviceId: key,
                serviceName: s.name || 'Không xác định',
                revenue: r.revenue,
                cost: r.cost,
                profit: r.profit,
                margin: r.margin,
            };
        }
        return {
            serviceId: key,
            serviceName: s.name || 'Không xác định',
            revenue: 0,
            cost: 0,
            profit: 0,
            margin: 0,
        };
    });

    const summaryMargin = totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0;
    return {
        summary: {
            totalRevenue,
            totalCost,
            profit: totalProfit,
            margin: Number(summaryMargin.toFixed(2)),
            marketingCost: totalMarketingCost,
            operationalCost: totalOperationalCost,
        },
        rows,
    };
}

/** Rebuild toàn bộ daily: lấy min/max ngày từ service_details (closedAt) và operational_costs (date), rồi rebuild toàn bộ khoảng. */
export async function rebuildAllFinancialReportDaily() {
    await connectDB();
    const [revenueRange, opRange] = await Promise.all([
        ServiceDetail.aggregate([
            {
                $match: {
                    closedAt: { $ne: null },
                    status: 'completed',
                    approvalStatus: 'approved',
                },
            },
            { $group: { _id: null, min: { $min: '$closedAt' }, max: { $max: '$closedAt' } } },
        ]),
        OperationalCost.aggregate([
            { $match: { date: { $ne: null } } },
            { $group: { _id: null, min: { $min: '$date' }, max: { $max: '$date' } } },
        ]),
    ]);
    const mins = [];
    const maxs = [];
    if (revenueRange[0]?.min) mins.push(revenueRange[0].min);
    if (revenueRange[0]?.max) maxs.push(revenueRange[0].max);
    if (opRange[0]?.min) mins.push(opRange[0].min);
    if (opRange[0]?.max) maxs.push(opRange[0].max);
    if (mins.length === 0) return;
    const minDate = new Date(Math.min(...mins.map((d) => new Date(d).getTime())));
    const maxDate = new Date(Math.max(...maxs.map((d) => new Date(d).getTime())));
    const fromStr = minDate.toISOString().slice(0, 10);
    const toStr = maxDate.toISOString().slice(0, 10);
    await rebuildFinancialReportDailyForDateRange(fromStr, toStr);
}

