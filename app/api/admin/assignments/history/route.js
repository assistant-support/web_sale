import { NextResponse } from 'next/server';
import connectDB from '@/config/connectDB';
import AssignmentHistory from '@/models/assignmentHistory.model';
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
        
        // Get recent assignment history
        const history = await AssignmentHistory.find()
            .populate('customer', 'name phone')
            .populate('assignedBy', 'name email')
            .populate('assignedTo', 'name email')
            .sort({ assignedAt: -1 })
            .limit(50);
        
        return NextResponse.json(history);
    } catch (error) {
        console.error('Error fetching assignment history:', error);
        return NextResponse.json(
            { error: error.message },
            { status: 500 }
        );
    }
}
