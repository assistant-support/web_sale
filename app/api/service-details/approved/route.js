import { NextResponse } from 'next/server';
import { getApprovedDeals } from '@/data/service_details/handledata.db';

export async function GET(request) {
    try {
        const { searchParams } = new URL(request.url);
        const fromDate = searchParams.get('fromDate');
        const toDate = searchParams.get('toDate');
        const sourceId = searchParams.get('sourceId');
        const serviceId = searchParams.get('serviceId');
        const limit = parseInt(searchParams.get('limit') || '10', 10);
        const skip = parseInt(searchParams.get('skip') || '0', 10);
        
        const params = {};
        if (fromDate) {
            params.fromDate = fromDate;
        }
        if (toDate) {
            params.toDate = toDate;
        }
        if (sourceId) {
            params.sourceId = sourceId;
        }
        if (serviceId) {
            params.serviceId = serviceId;
        }
        params.limit = limit;
        params.skip = skip;
        
        const result = await getApprovedDeals(params);
        
        return NextResponse.json({ success: true, data: result.data, total: result.total });
    } catch (error) {
        console.error('Error in GET /api/service-details/approved:', error);
        return NextResponse.json(
            { success: false, error: error.message },
            { status: 500 }
        );
    }
}

