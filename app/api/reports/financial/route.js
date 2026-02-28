import { NextResponse } from 'next/server';
import connectDB from '@/config/connectDB';
import FinancialReport from '@/models/financialReport.model';
import Service from '@/models/services.model';

export async function GET(req) {
    try {
        await connectDB();
        const { searchParams } = new URL(req.url);
        const yearParam = searchParams.get('year');
        const monthParam = searchParams.get('month');

        if (!yearParam || !monthParam) {
            return NextResponse.json(
                { success: false, error: 'Thiếu year hoặc month.' },
                { status: 400 }
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

        // Lấy tất cả dịch vụ (bảng dịch vụ) để hiển thị đủ trong Nhóm dịch vụ
        const allServices = await Service.find({}).select('_id name').sort({ name: 1 }).lean();
        const reports = await FinancialReport.find({ year, month }).lean();

        const reportByServiceId = new Map();
        let totalRevenue = 0;
        let totalCost = 0;
        let totalProfit = 0;
        reports.forEach((r) => {
            const key = String(r.serviceId);
            reportByServiceId.set(key, r);
            totalRevenue += Number(r.revenue || 0);
            totalCost += Number(r.totalCost || 0);
            totalProfit += Number(r.profit || 0);
        });

        // Mỗi dịch vụ một dòng: có báo cáo thì dùng số liệu, không có thì 0
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

        const summaryMargin = totalRevenue > 0 ? ((totalProfit / totalRevenue) * 100) : 0;

        return NextResponse.json(
            {
                success: true,
                summary: {
                    totalRevenue,
                    totalCost,
                    profit: totalProfit,
                    margin: Number(summaryMargin.toFixed(2)),
                },
                rows,
            },
            { status: 200 }
        );
    } catch (error) {
        console.error('[API report/financial] GET error', error);
        return NextResponse.json(
            { success: false, error: error?.message || 'Lỗi khi đọc financial_reports.' },
            { status: 500 }
        );
    }
}

