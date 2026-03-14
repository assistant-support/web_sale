import { NextResponse } from 'next/server';
import connectDB from '@/config/connectDB';
import FinancialReport from '@/models/financialReport.model';
import Service from '@/models/services.model';
import {
    getFinancialReportForDateRange,
    getFinancialReportFromDaily,
} from '@/data/financial/financialReports.db';

export async function GET(req) {
    try {
        await connectDB();
        const { searchParams } = new URL(req.url);
        const fromParam = searchParams.get('from');
        const toParam = searchParams.get('to');
        const yearParam = searchParams.get('year');
        const monthParam = searchParams.get('month');

        // Ưu tiên lọc theo khoảng ngày (from, to): đọc từ financial_reports_daily, không có thì aggregate từ nguồn gốc
        if (fromParam && toParam) {
            const from = new Date(fromParam + 'T00:00:00');
            const to = new Date(toParam + 'T23:59:59.999');
            if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || from > to) {
                return NextResponse.json(
                    { success: false, error: 'Khoảng ngày không hợp lệ (from, to).' },
                    { status: 400 }
                );
            }
            const fromDaily = await getFinancialReportFromDaily(fromParam, toParam);
            const result = fromDaily ?? (await getFinancialReportForDateRange(fromParam, toParam));
            return NextResponse.json(
                { success: true, ...result, fromDaily: !!fromDaily },
                { status: 200 }
            );
        }

        // Không có from/to và không có year/month → tổng hợp tất cả tháng (all-time)
        if (!yearParam || !monthParam) {
            const allServices = await Service.find({}).select('_id name').sort({ name: 1 }).lean();
            const agg = await FinancialReport.aggregate([
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
                const costRow = Number(r.totalCost || 0);
                const profit = Number(r.profit || 0);
                totalRevenue += revenue;
                totalCost += costRow;
                totalProfit += profit;
                totalMarketingCost += Number(r.marketingCost || 0);
                totalOperationalCost += Number(r.operationalCost || 0);
                const margin = revenue > 0 ? (profit / revenue) * 100 : 0;
                reportByServiceId.set(key, {
                    revenue,
                    cost: costRow,
                    profit,
                    margin: Number(margin.toFixed(2)),
                });
            });
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
            return NextResponse.json(
                {
                    success: true,
                    summary: {
                        totalRevenue,
                        totalCost,
                        profit: totalProfit,
                        margin: Number(summaryMargin.toFixed(2)),
                        marketingCost: totalMarketingCost,
                        operationalCost: totalOperationalCost,
                    },
                    rows,
                },
                { status: 200 }
            );
        }

        const year = Number(yearParam);
        const month = Number(monthParam);

        if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
            return NextResponse.json(
                { success: false, error: 'Giá trị year/month không hợp lệ.' },
                { status: 400 }
            );
        }

        const allServices = await Service.find({}).select('_id name').sort({ name: 1 }).lean();
        const reports = await FinancialReport.find({ year, month }).lean();

        const reportByServiceId = new Map();
        let totalRevenue = 0;
        let totalCost = 0;
        let totalProfit = 0;
        let totalMarketingCost = 0;
        let totalOperationalCost = 0;
        reports.forEach((r) => {
            const key = String(r.serviceId);
            reportByServiceId.set(key, r);
            totalRevenue += Number(r.revenue || 0);
            totalCost += Number(r.totalCost || 0);
            totalProfit += Number(r.profit || 0);
            totalMarketingCost += Number(r.marketingCost || 0);
            totalOperationalCost += Number(r.operationalCost || 0);
        });

        const rows = allServices.map((s) => {
            const key = String(s._id);
            const r = reportByServiceId.get(key);
            if (r) {
                const revenue = Number(r.revenue || 0);
                const costRow = Number(r.totalCost || 0);
                const profit = Number(r.profit || 0);
                const margin = revenue > 0 ? ((profit / revenue) * 100) : 0;
                return {
                    serviceId: key,
                    serviceName: s.name || 'Không xác định',
                    revenue,
                    cost: costRow,
                    profit,
                    margin: Number(margin.toFixed(2)),
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

        return NextResponse.json(
            {
                success: true,
                summary: {
                    totalRevenue,
                    totalCost,
                    profit: totalProfit,
                    margin: Number(summaryMargin.toFixed(2)),
                    marketingCost: totalMarketingCost,
                    operationalCost: totalOperationalCost,
                },
                rows,
            },
            { status: 200 }
        );
    } catch (error) {
        console.error('[API report/financial] GET error', error);
        return NextResponse.json(
            { success: false, error: error?.message || 'Lỗi khi đọc báo cáo tài chính.' },
            { status: 500 }
        );
    }
}

