import { NextResponse } from 'next/server';
import connectDB from '@/config/connectDB';
import Customer from '@/models/customer.model';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/options';

export async function GET() {
    try {
        const session = await getServerSession(authOptions);
        
        if (!session || !session.user.isAdmin) {
            return NextResponse.json(
                { error: 'Unauthorized access' },
                { status: 401 }
            );
        }
        
        await connectDB();
        
        // Count total customers
        const total = await Customer.countDocuments();
        
        // Count customers with assignments
        const assigned = await Customer.countDocuments({
            assignees: { $exists: true, $ne: [] }
        });
        
        // Calculate waiting customers
        const waiting = total - assigned;
        
        return NextResponse.json({
            total,
            assigned,
            waiting
        });
    } catch (error) {
        console.error('Error fetching assignment stats:', error);
        return NextResponse.json(
            { error: error.message },
            { status: 500 }
        );
    }
}
