import { NextResponse } from 'next/server';
import dbConnect from '@/config/connectDB';
import Medicine from '@/models/medicine.model';
import { normalize } from '@/utils/normalize';

export async function GET(request) {
    try {
        const { searchParams } = new URL(request.url);
        const q = searchParams.get('q') || '';

        if (q.length < 2) {
            return NextResponse.json([]);
        }

        await dbConnect();
        const keyword = normalize(q);

        const medicines = await Medicine.find(
            { nameSearch: { $regex: `^${keyword}`, $options: 'i' } },
            { name: 1, _id: 1 }
        )
            .limit(10)
            .lean();

        return NextResponse.json(medicines);
    } catch (error) {
        console.error('Error searching medicines:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

