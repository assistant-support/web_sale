import { NextResponse } from 'next/server';
import Customer from '@/models/customer.model';
import User from '@/models/user.model';
import connectDB from '@/config/connectDB';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import AssignmentLog from '@/models/assignmentlog.model';

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session || !session.user) {
      return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
    }

    await connectDB();

    // Get total, assigned and pending counts
    const total = await Customer.countDocuments();
    const assigned = await Customer.countDocuments({ assignees: { $exists: true, $not: { $size: 0 } } });
    const pending = total - assigned;

    // Get distribution by staff
    const users = await User.find({ role: { $in: ['admin', 'sales'] } }).select('name email status');
    
    // For each user, count assigned customers
    const byStaffPromises = users.map(async (user) => {
      const count = await Customer.countDocuments({ assignees: user._id });
      return {
        id: user._id.toString(),
        name: user.name,
        email: user.email,
        count,
        activeStatus: user.status === 'active'
      };
    });
    
    const byStaff = await Promise.all(byStaffPromises);
    
    // Get recent assignment history
    const recentLogs = await AssignmentLog.find()
      .sort({ createdAt: -1 })
      .limit(50)
      .populate('customer', 'name phone')
      .populate('assignedTo', 'name')
      .populate('assignedBy', 'name');
      
    const recentAssignments = recentLogs.map(log => ({
      id: log._id.toString(),
      date: log.createdAt,
      customerName: log.customer?.name || 'Unknown',
      customerPhone: log.customer?.phone || 'Unknown',
      assignedTo: log.assignedTo?.name || 'Unknown',
      assignedBy: log.assignedBy?.name || 'Unknown',
      notes: log.notes
    }));

    return NextResponse.json({
      success: true,
      data: {
        total,
        assigned,
        pending,
        byStaff,
        recentAssignments
      }
    });
  } catch (error) {
    console.error('Error fetching assignment stats:', error);
    return NextResponse.json(
      { success: false, message: error.message },
      { status: 500 }
    );
  }
}
