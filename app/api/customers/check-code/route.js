import dbConnect from '@/config/connectDB';
import Customer from '@/models/customer.model';
import { NextResponse } from 'next/server';

export async function GET(req) {
    try {
        await dbConnect();
        const { searchParams } = new URL(req.url);
        const code = searchParams.get('code');

        if (!code) {
            return NextResponse.json({ success: false, error: 'Thiếu mã khách hàng' }, { status: 400 });
        }

        const exists = await Customer.exists({ customerCode: code.trim() });
        
        return NextResponse.json({
            success: true,
            isAvailable: !exists
        });
    } catch (error) {
        console.error('[API check-code] Error:', error);
        return NextResponse.json({ success: false, error: 'Lỗi server' }, { status: 500 });
    }
}
