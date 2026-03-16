import { NextResponse } from 'next/server';
import { getCustomersForReportsPaginated } from '@/data/customers/handledata.db';

const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 100;

export async function GET(request) {
    try {
        const { searchParams } = new URL(request.url);
        const limit = Math.min(Math.max(1, parseInt(searchParams.get('limit') || DEFAULT_LIMIT, 10)), MAX_LIMIT);
        const offset = Math.max(0, parseInt(searchParams.get('offset') || '0', 10));

        const { customers, total } = await getCustomersForReportsPaginated(limit, offset);

        return NextResponse.json({
            success: true,
            data: { customers: customers || [], total: total ?? 0 },
        });
    } catch (error) {
        console.error('[API reports/overview/customers]', error);
        return NextResponse.json(
            { success: false, error: error?.message || 'Lỗi khi tải khách hàng.' },
            { status: 500 }
        );
    }
}
