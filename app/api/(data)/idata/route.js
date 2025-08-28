import { NextResponse } from 'next/server';
import connectDB from '@/config/connectDB';
import Customer from '@/models/customer';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Key cố định
const EXPECTED_KEY = 'AIzaSyCQYlefMrueYu1JPWKeEdSOPpSmb9Rceg8';

// Chuẩn hoá phone: chỉ trim 2 bên & thêm '0' nếu chưa có ở đầu
function normalizePhone(v) {
    let t = String(v ?? '').trim();
    if (!t) return '';
    if (!t.startsWith('0')) t = '0' + t;
    return t;
}

export async function POST(req) {
    try {
        const body = await req.json().catch(() => ({}));
        const { key, rowNumber, data } = body || {};

        // 1) Kiểm tra key trước khi xử lý
        if (key !== EXPECTED_KEY) {
            return NextResponse.json(
                { status: false, message: 'Invalid key' },
                { status: 401 }
            );
        }

        // 2) Chuẩn hoá & kiểm tra phone
        const phone = normalizePhone(data?.phone);
        if (!phone) {
            return NextResponse.json(
                { status: false, message: 'Missing phone' },
                { status: 400 }
            );
        }

        // 3) Kết nối DB (sau khi pass key)
        await connectDB();

        // 4) Kiểm tra trùng theo phone (đã chuẩn hoá)
        const existed = await Customer.exists({ phone });
        if (existed) {
            return NextResponse.json(
                { status: false, message: 'duplicate_phone', phone },
                { status: 409 }
            );
        }

        // 5) Tạo mới khách hàng từ dữ liệu A..H của sheet
        const doc = await Customer.create({
            address: data?.address,
            phone,                 // đã chuẩn hoá
            name: data?.name,
            email: data?.email,
            age: data?.age,
            area: data?.area,
            source: data?.source,  // schema strict:false nên OK dù là string hay ObjectId
            sheetCreatedAt: data?.createAt,
            meta: {
                gsheetKey: key,
                gsheetRow: rowNumber,
            },
            createdFrom: 'gsheet',
        });

        return NextResponse.json({
            status: true,
            message: 'OK',
            id: doc?._id,
            phone,
        });
    } catch (err) {
        console.error('API error:', err);
        return NextResponse.json(
            { status: false, message: err?.message || 'Internal error' },
            { status: 500 }
        );
    }
}
