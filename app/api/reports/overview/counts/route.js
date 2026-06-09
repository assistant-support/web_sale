import { NextResponse } from 'next/server';
import { getOverviewCounts } from '@/data/reports/overviewCounts.db';

/** Số lượng trong DB — hỗ trợ bộ lọc toàn cục qua query string. */
export async function GET(request) {
    try {
        const { searchParams } = new URL(request.url);
        const filters = {
            sourceFilter: searchParams.get('source') || 'all',
            serviceFilter: searchParams.get('service') || 'all',
            appointmentTypeFilter: searchParams.get('appointmentType') || 'all',
            customerTypeFilter: searchParams.get('customerType') || 'all',
            startDate: searchParams.get('startDate') || '',
            endDate: searchParams.get('endDate') || '',
        };

        const data = await getOverviewCounts(filters);

        return NextResponse.json({ success: true, data });
    } catch (error) {
        console.error('[API reports/overview/counts]', error);
        return NextResponse.json(
            { success: false, error: error?.message || 'Lỗi khi đếm.' },
            { status: 500 }
        );
    }
}
