// pages/api/saveHistory.js
import { NextResponse } from 'next/server';
import dbConnect from '@/config/connectDB';
import SendHistory from '@/models/historyClient';
import authenticate from '@/utils/authenticate';

export async function POST(req) {
    try {
        const { user, body } = await authenticate(req);
        const { mes, labels, results } = body;
        const sentBy = user.id;
        if (
            typeof mes !== 'string' ||
            !Array.isArray(labels) ||
            !Array.isArray(results) ||
            typeof sentBy !== 'string'
        ) {
            return NextResponse.json(
                { status: 1, mes: 'Bad request payload', data: [] },
                { status: 400 }
            );
        }
        await dbConnect();
        const recipients = results.map(r => ({
            phone: r.phone,
            status: r.status,
            error: r.error || ''
        }));
        const doc = await SendHistory.create({
            sentBy,
            message: mes,
            labels,
            recipients,
        });
        return NextResponse.json(
            { status: 2, mes: 'History saved', data: { id: doc._id } },
            { status: 201 }
        );
    } catch (err) {
        console.error('saveHistory POST error:', err);
        return NextResponse.json(
            { status: 0, mes: 'Internal error', data: [] },
            { status: 500 }
        );
    }
}

export async function GET(req) {
    try {
        await dbConnect();
        const histories = await SendHistory
            .find({})
            .sort({ sentAt: -1 })
            .lean();
        return NextResponse.json(
            { status: 2, mes: 'Fetched history', data: histories },
            { status: 200 }
        );
    } catch (err) {
        console.error('saveHistory GET error:', err);
        return NextResponse.json(
            { status: 0, mes: 'Internal error', data: [] },
            { status: 500 }
        );
    }
}
