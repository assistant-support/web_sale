import { NextResponse } from 'next/server';
import connectDB from '@/config/connectDB';
import MarketingCost from '@/models/marketingCost.model';
import { rebuildFinancialReportDailyForDateRange } from '@/data/financial/financialReports.db';
import checkAuthToken from '@/utils/checktoken';

export async function POST(req) {
    try {
        const user = await checkAuthToken();
        if (!user || (!user.role.includes('Admin') && !user.role.includes('Manager'))) {
            return NextResponse.json({ success: false, error: 'Không có quyền truy cập' }, { status: 403 });
        }

        await connectDB();
        const body = await req.json();
        const { source, sourceType, startDate, endDate, amount, note } = body;

        if (!source || !startDate || !endDate || !amount) {
            return NextResponse.json({ success: false, error: 'Thiếu thông tin bắt buộc' }, { status: 400 });
        }
        
        const channelType = sourceType === 'message' ? 'message' : 'form';

        const doc = {
            channelType,
            startDate: new Date(startDate),
            endDate: new Date(endDate),
            amount: Number(amount),
            note: note || '',
            createdBy: user.id,
        };

        if (channelType === 'form') {
            doc.source = source; // ObjectId của form
        } else {
            doc.messageSourceKey = source; // key sourceDetails của kênh tin nhắn
        }

        const cost = await MarketingCost.create(doc);

        const fromStr = doc.startDate.toISOString().slice(0, 10);
        const toStr = doc.endDate.toISOString().slice(0, 10);
        try {
            await rebuildFinancialReportDailyForDateRange(fromStr, toStr);
        } catch (e) {
            console.error('Lỗi rebuild daily sau khi thêm chi phí marketing:', e?.message || e);
        }

        return NextResponse.json({ success: true, data: cost }, { status: 201 });
    } catch (error) {
        console.error('Lỗi khi lưu chi phí marketing:', error);
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}

export async function PUT(req) {
    try {
        const user = await checkAuthToken();
        if (!user || (!user.role.includes('Admin') && !user.role.includes('Manager'))) {
            return NextResponse.json({ success: false, error: 'Không có quyền truy cập' }, { status: 403 });
        }

        await connectDB();
        const body = await req.json();
        const { id, startDate, endDate, amount, note } = body;

        if (!id || !startDate || !endDate || typeof amount === 'undefined') {
            return NextResponse.json({ success: false, error: 'Thiếu thông tin bắt buộc' }, { status: 400 });
        }

        const update = {
            startDate: new Date(startDate),
            endDate: new Date(endDate),
            amount: Number(amount),
            note: note || '',
        };

        const cost = await MarketingCost.findByIdAndUpdate(id, update, { new: true });
        if (!cost) {
            return NextResponse.json({ success: false, error: 'Không tìm thấy bản ghi chi phí' }, { status: 404 });
        }

        const fromStr = cost.startDate.toISOString().slice(0, 10);
        const toStr = cost.endDate.toISOString().slice(0, 10);
        try {
            await rebuildFinancialReportDailyForDateRange(fromStr, toStr);
        } catch (e) {
            console.error('Lỗi rebuild daily sau khi cập nhật chi phí marketing:', e?.message || e);
        }

        return NextResponse.json({ success: true, data: cost }, { status: 200 });
    } catch (error) {
        console.error('Lỗi khi cập nhật chi phí marketing:', error);
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}

export async function GET(req) {
    try {
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

        const costs = await MarketingCost.find(query)
            .populate('source', 'name')
            .populate('createdBy', 'name')
            .sort({ createdAt: -1 })
            .lean();

        return NextResponse.json({ success: true, data: costs }, { status: 200 });
    } catch (error) {
        console.error('Lỗi khi lấy chi phí marketing:', error);
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}

