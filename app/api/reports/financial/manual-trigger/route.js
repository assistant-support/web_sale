import { NextResponse } from 'next/server';
import connectDB from '@/config/connectDB';
import checkAuthToken from '@/utils/checktoken';
import ServiceDetail from '@/models/service_details.model';
import { rebuildFinancialReportForMonth, rebuildAllFinancialReports } from '@/data/financial/financialReports.db';

export async function POST(req) {
    try {
        const user = await checkAuthToken();
        if (!user || (!user.role.includes('Admin') && !user.role.includes('Manager'))) {
            return NextResponse.json({ success: false, error: 'Không có quyền truy cập' }, { status: 403 });
        }

        await connectDB();

        const body = await req.json();
        const { mode } = body || {};

        if (!mode || !['rebuild_all', 'current_month'].includes(mode)) {
            return NextResponse.json({ success: false, error: 'Mode không hợp lệ.' }, { status: 400 });
        }

        if (mode === 'current_month') {
            const now = new Date();
            const year = now.getFullYear();
            const month = now.getMonth() + 1;
            await rebuildFinancialReportForMonth(year, month);

            return NextResponse.json(
                { success: true, message: `Đã tính lại báo cáo tài chính cho ${month}/${year}.` },
                { status: 200 }
            );
        }

        // mode === 'rebuild_all'
        await rebuildAllFinancialReports();

        return NextResponse.json(
            { success: true, message: 'Đã rebuild toàn bộ báo cáo tài chính (tất cả tháng có doanh thu).' },
            { status: 200 }
        );
    } catch (error) {
        console.error('[API report/financial/manual-trigger]', error);
        return NextResponse.json(
            { success: false, error: error?.message || 'Lỗi Dev Manual Trigger báo cáo tài chính.' },
            { status: 500 }
        );
    }
}

