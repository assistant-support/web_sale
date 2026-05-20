import { NextResponse } from 'next/server';
import connectDB from '@/config/connectDB';
import Customer from '@/models/customer.model';
import Appointment from '@/models/appointment.model';

/** Số lượng thật trong DB (để hiển thị trong thẻ), không phụ thuộc phân trang. */
export async function GET() {
    try {
        await connectDB();
        const [
            customersTotal,
            appointmentsTotal,
            customersWithAppointmentsTotal,
            customersWithOrdersTotal,
            oldCustomersTotal,
            arrivedCustomersAgg,
        ] = await Promise.all([
            Customer.countDocuments({}),
            Appointment.countDocuments({}),
            Customer.countDocuments({ 'pipelineStatus.5': 'scheduled_unconfirmed_4' }),
            Customer.countDocuments({ 'serviceDetails.0': { $exists: true } }),
            Customer.countDocuments({ customerType: 'old' }),
            Appointment.aggregate([
                { $match: { status: 'completed' } },
                { $group: { _id: '$customer' } },
                { $count: 'total' },
            ]),
        ]);
        const customersArrivedTotal = arrivedCustomersAgg?.[0]?.total ?? 0;
        return NextResponse.json({
            success: true,
            data: {
                customersTotal: customersTotal ?? 0,
                appointmentsTotal: appointmentsTotal ?? 0,
                customersWithAppointmentsTotal: customersWithAppointmentsTotal ?? 0,
                customersWithOrdersTotal: customersWithOrdersTotal ?? 0,
                oldCustomersTotal: oldCustomersTotal ?? 0,
                customersArrivedTotal,
            },
        });
    } catch (error) {
        console.error('[API reports/overview/counts]', error);
        return NextResponse.json(
            { success: false, error: error?.message || 'Lỗi khi đếm.' },
            { status: 500 }
        );
    }
}
