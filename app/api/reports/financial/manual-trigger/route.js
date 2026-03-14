import { NextResponse } from 'next/server';
import connectDB from '@/config/connectDB';
import checkAuthToken from '@/utils/checktoken';
import {
    rebuildFinancialReportForMonth,
    rebuildAllFinancialReports,
    rebuildFinancialReportDailyForDateRange,
    rebuildAllFinancialReportDaily,
} from '@/data/financial/financialReports.db';

export async function POST(req) {
    try {
        const user = await checkAuthToken();
        if (!user || (!user.role.includes('Admin') && !user.role.includes('Manager'))) {
            return NextResponse.json({ success: false, error: 'Không có quyền truy cập' }, { status: 403 });
        }

        await connectDB();

        const body = await req.json();
        const { mode, from, to } = body || {};

        const validModes = ['rebuild_all', 'current_month', 'rebuild_daily_all', 'rebuild_daily_range'];
        if (!mode || !validModes.includes(mode)) {
            return NextResponse.json(
                { success: false, error: `Mode không hợp lệ. Chọn: ${validModes.join(', ')}.` },
                { status: 400 }
            );
        }

        if (mode === 'current_month') {
            const now = new Date();
            const year = now.getFullYear();
            const month = now.getMonth() + 1;
            await rebuildFinancialReportForMonth(year, month);

            return NextResponse.json(
                { success: true, message: `Đã tính lại báo cáo tài chính (tháng) cho ${month}/${year}.` },
                { status: 200 }
            );
        }

        if (mode === 'rebuild_all') {
            await rebuildAllFinancialReports();
            return NextResponse.json(
                { success: true, message: 'Đã rebuild toàn bộ báo cáo tài chính tháng (tất cả tháng có doanh thu).' },
                { status: 200 }
            );
        }

        if (mode === 'rebuild_daily_all') {
            await rebuildAllFinancialReportDaily();
            return NextResponse.json(
                { success: true, message: 'Đã rebuild toàn bộ báo cáo tài chính theo ngày (financial_reports_daily).' },
                { status: 200 }
            );
        }

        if (mode === 'rebuild_daily_range') {
            if (!from || !to) {
                return NextResponse.json(
                    { success: false, error: 'Mode rebuild_daily_range cần tham số from và to (YYYY-MM-DD).' },
                    { status: 400 }
                );
            }
            await rebuildFinancialReportDailyForDateRange(from, to);
            return NextResponse.json(
                { success: true, message: `Đã rebuild báo cáo daily từ ${from} đến ${to}.` },
                { status: 200 }
            );
        }

        return NextResponse.json({ success: false, error: 'Mode không xử lý.' }, { status: 400 });
    } catch (error) {
        console.error('[API report/financial/manual-trigger]', error);
        return NextResponse.json(
            { success: false, error: error?.message || 'Lỗi Dev Manual Trigger báo cáo tài chính.' },
            { status: 500 }
        );
    }
}

