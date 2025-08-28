import { NextResponse } from 'next/server';
import dbConnect from '@/config/connectDB';
import SendHistory from '@/models/historyClient';

export async function GET(req, { params }) {
    try {
        const { phone } = params;
        
        if (typeof phone !== 'string') {
            return NextResponse.json(
                { status: 1, mes: 'Bad request: missing phone param', data: [] },
                { status: 400 }
            );
        }

        await dbConnect();
        const histories = await SendHistory
            .find({ 'recipients.phone': phone })
            .sort({ sentAt: -1 })
            .lean();

        // Lọc mỗi history chỉ giữ recipient đúng số này
        const filtered = histories.map(doc => ({
            ...doc,
            recipients: doc.recipients.filter(r => r.phone === phone)
        }));

        return NextResponse.json(
            { status: 2, mes: 'Fetched user history', data: filtered },
            { status: 200 }
        );
    } catch (err) {
        return NextResponse.json(
            { status: 0, mes: 'Internal error', data: [] },
            { status: 500 }
        );
    }
}
