export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import checkAuthToken from '@/utils/checktoken';
import { generateCustomerCodeByType } from '@/utils/customerCode';

export async function GET(req) {
    try {
        const session = await checkAuthToken();
        if (!session?.id) {
            return NextResponse.json(
                { success: false, error: 'Yêu cầu đăng nhập.' },
                { status: 401 }
            );
        }

        const { searchParams } = new URL(req.url);
        const typeRaw = (searchParams.get('type') || '').toString().trim().toUpperCase();

        const type = typeRaw === 'NORMAL' ? 'NORMAL' : typeRaw === 'TN' ? 'TN' : null;
        if (!type) {
            return NextResponse.json(
                { success: false, error: 'type không hợp lệ. Dùng NORMAL hoặc TN.' },
                { status: 400 }
            );
        }

        const payload = await generateCustomerCodeByType(type);
        return NextResponse.json({
            success: true,
            suggestedCode: payload.customerCode,
        });
    } catch (err) {
        return NextResponse.json(
            { success: false, error: err?.message || String(err) },
            { status: 500 }
        );
    }
}

