import { NextResponse } from 'next/server';
import connectDB from '@/config/connectDB';
import OperationalCost from '@/models/operationalCost.model';
import { rebuildFinancialReportForMonth } from '@/data/financial/financialReports.db';
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
        
        const start = new Date(startDate);
        const end = new Date(endDate);

        const doc = {
            startDate: start,
            endDate: end,
            costType: costType.trim(),
            amount: Number(amount),
            note: note || '',
            createdBy: user.id,
            // date chuẩn hoá: dùng startDate làm đại diện để dễ index theo tháng/ngày
            date: start,
        };
        if (serviceId) {
            doc.serviceId = serviceId;
        }

        const cost = await OperationalCost.create(doc);

        // Sau khi thêm chi phí vận hành, tính lại báo cáo tài chính cho tháng tương ứng
        const year = start.getFullYear();
        const month = start.getMonth() + 1;
        await rebuildFinancialReportForMonth(year, month);

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
            query = {
                $or: [
                    { startDate: { $lte: new Date(endDate) }, endDate: { $gte: new Date(startDate) } }
                ]
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

