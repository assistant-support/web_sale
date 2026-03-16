import { NextResponse } from 'next/server';
import { getAppointmentsPaginated } from '@/data/appointment_db/handledata.db';

const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 100;

export async function GET(request) {
    try {
        const { searchParams } = new URL(request.url);
        const limit = Math.min(Math.max(1, parseInt(searchParams.get('limit') || DEFAULT_LIMIT, 10)), MAX_LIMIT);
        const offset = Math.max(0, parseInt(searchParams.get('offset') || '0', 10));

        const { appointments, total } = await getAppointmentsPaginated(limit, offset);

        return NextResponse.json({
            success: true,
            data: { appointments: appointments || [], total: total ?? 0 },
        });
    } catch (error) {
        console.error('[API reports/overview/appointments]', error);
        return NextResponse.json(
            { success: false, error: error?.message || 'Lỗi khi tải lịch hẹn.' },
            { status: 500 }
        );
    }
}
