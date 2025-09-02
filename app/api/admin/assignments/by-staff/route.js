import { NextResponse } from 'next/server';
import connectDB from '@/config/connectDB';
import Customer from '@/models/customer.model';
import User from '@/models/user.model';
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
        
        // Get all staff users
        const staffUsers = await User.find({ role: 'STAFF' }, 'name email');
        
        // For each staff, get count of assigned customers
        const staffWithAssignments = await Promise.all(
            staffUsers.map(async (user) => {
                const assignedCount = await Customer.countDocuments({
                    assignees: user._id
                });
                
                return {
                    _id: user._id,
                    name: user.name,
                    email: user.email,
                    assignedCount
                };
            })
        );
        
        // Sort by assignment count (descending)
        staffWithAssignments.sort((a, b) => b.assignedCount - a.assignedCount);
        
        return NextResponse.json(staffWithAssignments);
    } catch (error) {
        console.error('Error fetching staff assignments:', error);
        return NextResponse.json(
            { error: error.message },
            { status: 500 }
        );
    }
}
