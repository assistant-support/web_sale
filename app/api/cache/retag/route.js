import { NextResponse } from 'next/server';
import { revalidateData } from '@/app/actions/customer.actions';

export async function POST(request) {
    try {
        const { secret, tag } = await request.json();

        if (secret !== process.env.REVALIDATE_SECRET_TOKEN) {
            return NextResponse.json({ message: 'Invalid secret token' }, { status: 401 });
        }

        if (tag === 'customers') {
            await revalidateData();
        }

        return NextResponse.json({ revalidated: false, message: 'Invalid tag' }, { status: 400 });

    } catch (error) {
        return NextResponse.json({ message: 'Error revalidating', error: error.message }, { status: 500 });
    }
}