import { NextResponse } from 'next/server';
import connectDB from '@/config/connectDB';
import Customer from '@/models/customer.model';
import Appointment from '@/models/appointment.model';

/** Số lượng thật trong DB (để hiển thị trong thẻ), không phụ thuộc phân trang. */
export async function GET() {
    try {
        await connectDB();
        const [customersTotal, appointmentsTotal] = await Promise.all([
            Customer.countDocuments({}),
            Appointment.countDocuments({}),
        ]);
        return NextResponse.json({
            success: true,
            data: { customersTotal: customersTotal ?? 0, appointmentsTotal: appointmentsTotal ?? 0 },
        });
    } catch (error) {
        console.error('[API reports/overview/counts]', error);
        return NextResponse.json(
            { success: false, error: error?.message || 'Lỗi khi đếm.' },
            { status: 500 }
        );
    }
}
