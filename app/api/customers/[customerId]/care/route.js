export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import { getCustomerCareLogs } from '@/data/customers/handledata.db';
import checkAuthToken from '@/utils/checktoken';

/**
 * API route để lấy care logs (lịch sử tương tác) của khách hàng theo phân trang.
 * GET /api/customers/[customerId]/care?page=1&limit=20
 */
export async function GET(req, { params }) {
    try {
        const session = await checkAuthToken();
        if (!session?.id) {
            return NextResponse.json(
                { success: false, error: 'Yêu cầu đăng nhập.' },
                { status: 401 }
            );
        }

        const { customerId } = await params;
        if (!customerId) {
            return NextResponse.json(
                { success: false, error: 'Thiếu customerId.' },
                { status: 400 }
            );
        }

        const { searchParams } = new URL(req.url);
        const page = parseInt(searchParams.get('page') || '1', 10);
        const limit = parseInt(searchParams.get('limit') || '20', 10);

        if (page < 1 || limit < 1 || limit > 100) {
            return NextResponse.json(
                { success: false, error: 'Tham số phân trang không hợp lệ. page >= 1, 1 <= limit <= 100.' },
                { status: 400 }
            );
        }

        const result = await getCustomerCareLogs(customerId, { page, limit });

        return NextResponse.json({
            success: true,
            ...result
        });

    } catch (error) {
        console.error('Lỗi khi lấy care logs:', error);
        return NextResponse.json(
            {
                success: false,
                error: error?.message || 'Đã xảy ra lỗi phía máy chủ.'
            },
            { status: 500 }
        );
    }
}

