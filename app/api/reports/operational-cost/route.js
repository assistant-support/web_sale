import { NextResponse } from 'next/server';
import connectDB from '@/config/connectDB';
import OperationalCost from '@/models/operationalCost.model';
import {
    rebuildFinancialReportForMonth,
    rebuildFinancialReportDailyForDateRange,
} from '@/data/financial/financialReports.db';
import checkAuthToken from '@/utils/checktoken';

export async function POST(req) {
    try {
        const user = await checkAuthToken();
        if (!user || (!user.role.includes('Admin') && !user.role.includes('Manager'))) {
            return NextResponse.json({ success: false, error: 'Không có quyền truy cập' }, { status: 403 });
        }

        await connectDB();
        const body = await req.json();
        const { startDate, endDate, costType, amount, note, serviceId } = body;

        if (!startDate || !endDate || !costType || !amount) {
            return NextResponse.json({ success: false, error: 'Thiếu thông tin bắt buộc' }, { status: 400 });
        }

        const start = new Date(String(startDate).trim() + 'T12:00:00.000Z');
        const end = new Date(String(endDate).trim() + 'T12:00:00.000Z');
        if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
            return NextResponse.json({ success: false, error: 'Ngày không hợp lệ' }, { status: 400 });
        }

        const now = new Date();
        const todayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0));

        const doc = {
            startDate: start,
            endDate: end,
            costType: costType.trim(),
            amount: Number(amount),
            note: note || '',
            createdBy: user.id,
            date: todayStart,
        };
        if (serviceId) {
            doc.serviceId = serviceId;
        }

        const cost = await OperationalCost.create(doc);

        const year = todayStart.getUTCFullYear();
        const month = todayStart.getUTCMonth() + 1;
        await rebuildFinancialReportForMonth(year, month);
        const fromStr = todayStart.toISOString().slice(0, 10);
        const lastDay = new Date(Date.UTC(year, month, 0));
        const toStr = lastDay.toISOString().slice(0, 10);
        try {
            await rebuildFinancialReportDailyForDateRange(fromStr, toStr);
        } catch (e) {
            console.error('Lỗi rebuild daily sau khi thêm chi phí vận hành:', e?.message || e);
        }

        return NextResponse.json({ success: true, data: cost }, { status: 201 });
    } catch (error) {
        console.error('Lỗi khi lưu chi phí vận hành:', error);
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}

export async function GET(req) {
    try {
        const user = await checkAuthToken();
        if (!user || (!user.role.includes('Admin') && !user.role.includes('Manager'))) {
            return NextResponse.json({ success: false, error: 'Không có quyền truy cập' }, { status: 403 });
        }

        await connectDB();
        const { searchParams } = new URL(req.url);
        const startDate = searchParams.get('startDate');
        const endDate = searchParams.get('endDate');

        let query = {};
        if (startDate && endDate) {
            const rangeStart = new Date(String(startDate).trim() + 'T00:00:00.000Z');
            const rangeEnd = new Date(String(endDate).trim() + 'T23:59:59.999Z');
            query = {
                startDate: { $lte: rangeEnd },
                endDate: { $gte: rangeStart },
            };
        }

        const costs = await OperationalCost.find(query)
            .populate('createdBy', 'name')
            .sort({ createdAt: -1 })
            .lean();

        return NextResponse.json({ success: true, data: costs }, { status: 200 });
    } catch (error) {
        console.error('Lỗi khi lấy chi phí vận hành:', error);
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}

