'use server';

import connectDB from '@/config/connectDB';
import ServiceDetail from '@/models/service_details.model';
import checkAuthToken from '@/utils/checktoken';
import mongoose from 'mongoose';

/**
 * API route để fetch nhiều serviceDetails cùng lúc
 * POST /api/service-details/batch
 * Body: { serviceDetailIds: ["id1", "id2", ...] }
 */
export async function POST(request) {
    try {
        const session = await checkAuthToken();
        if (!session?.id) {
            return Response.json({ success: false, error: 'Yêu cầu đăng nhập.' }, { status: 401 });
        }

        const body = await request.json();
        const { serviceDetailIds } = body;

        if (!Array.isArray(serviceDetailIds) || serviceDetailIds.length === 0) {
            return Response.json({ success: false, error: 'serviceDetailIds phải là mảng không rỗng.' }, { status: 400 });
        }

        // Validate ObjectIds
        const validIds = serviceDetailIds.filter(id => mongoose.Types.ObjectId.isValid(String(id)));
        if (validIds.length === 0) {
            return Response.json({ success: false, error: 'Không có serviceDetailId hợp lệ.' }, { status: 400 });
        }

        await connectDB();
        
        const serviceDetails = await ServiceDetail.find({
            _id: { $in: validIds.map(id => new mongoose.Types.ObjectId(id)) }
        })
            .populate('serviceId', 'name')
            .populate('customerId', 'name phone')
            .lean();

        // Convert dữ liệu thành JSON-safe format
        const plainData = serviceDetails.map(sd => JSON.parse(JSON.stringify(sd)));

        return Response.json({
            success: true,
            data: plainData
        });
    } catch (error) {
        console.error('Error in POST /api/service-details/batch:', error);
        return Response.json({
            success: false,
            error: error.message || 'Lỗi server khi lấy service details',
        }, { status: 500 });
    }
}

