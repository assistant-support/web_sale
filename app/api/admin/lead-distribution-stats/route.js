import { NextResponse } from 'next/server';
import Customer from '@/models/customer.model';
import User from '@/models/user.model';
import connectDB from '@/config/connectDB';
import { authOptions } from '@/app/api/auth/[...nextauth]/options';
import { getServerSession } from 'next-auth';

export async function GET(request) {
    try {
        const session = await getServerSession(authOptions);
        if (!session || !session.user.roles.includes('admin')) {
            return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
        }

        await connectDB();

        // Get query parameters
        const { searchParams } = new URL(request.url);
        const dateRange = searchParams.get('dateRange') || 'all';
        const staffId = searchParams.get('staff') || 'all';
        const search = searchParams.get('search') || '';

        // Build date filter based on range
        const dateFilter = {};
        if (dateRange !== 'all') {
            const now = new Date();
            let startDate;
            
            switch (dateRange) {
                case 'today':
                    startDate = new Date(now.setHours(0, 0, 0, 0));
                    break;
                case 'week':
                    const day = now.getDay();
                    startDate = new Date(now.setDate(now.getDate() - day));
                    startDate.setHours(0, 0, 0, 0);
                    break;
                case 'month':
                    startDate = new Date(now.getFullYear(), now.getMonth(), 1);
                    break;
            }
            
            dateFilter.createdAt = { $gte: startDate };
        }

        // Total count
        const totalCount = await Customer.countDocuments({
            ...dateFilter
        });

        // Assigned count
        const assignedCount = await Customer.countDocuments({
            ...dateFilter,
            assignee: { $exists: true, $ne: null }
        });

        // Staff stats
        const staffFilter = search ? 
            { 'name': { $regex: search, $options: 'i' } } : 
            {};
            
        const users = await User.find(staffFilter).select('_id name email avatar');
        
        // Get leads per staff
        const staffStats = await Promise.all(users.map(async (user) => {
            const leadCount = await Customer.countDocuments({
                ...dateFilter,
                assignee: user._id
            });
            
            const lastAssignment = await Customer.findOne({
                assignee: user._id
            }).sort({ assignedAt: -1 }).limit(1);
            
            return {
                id: user._id,
                name: user.name,
                email: user.email,
                avatar: user.avatar,
                leadCount,
                percentage: totalCount > 0 ? Math.round((leadCount / totalCount) * 100) : 0,
                lastAssignmentDate: lastAssignment?.assignedAt || null
            };
        }));
        
        // Sort by lead count descending
        staffStats.sort((a, b) => b.leadCount - a.leadCount);

        // Recent assignments
        const recentAssignments = await Customer.find({
            ...dateFilter,
            assignee: { $exists: true, $ne: null },
            assignedAt: { $exists: true }
        })
        .sort({ assignedAt: -1 })
        .limit(50)
        .populate('assignee', 'name')
        .populate('assignedBy', 'name')
        .select('name phone assignee assignedBy assignedAt isAutoAssigned');

        const formattedAssignments = recentAssignments.map(a => ({
            id: a._id,
            date: a.assignedAt,
            leadName: a.name,
            leadPhone: a.phone,
            assignedTo: a.assignee?.name || 'Unknown',
            assignedBy: a.assignedBy?.name || 'System',
            isAutoAssigned: a.isAutoAssigned || false
        }));

        return NextResponse.json({
            success: true,
            data: {
                total: totalCount,
                assigned: {
                    count: assignedCount,
                    percentage: totalCount > 0 ? Math.round((assignedCount / totalCount) * 100) : 0
                },
                pending: {
                    count: totalCount - assignedCount,
                    percentage: totalCount > 0 ? Math.round(((totalCount - assignedCount) / totalCount) * 100) : 0
                },
                staffStats,
                recentAssignments: formattedAssignments
            }
        });
    } catch (error) {
        console.error('Error in lead distribution stats API:', error);
        return NextResponse.json({
            success: false,
            message: error.message
        }, { status: 500 });
    }
}
