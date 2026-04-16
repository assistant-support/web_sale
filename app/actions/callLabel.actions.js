'use server';

import mongoose from 'mongoose';
import connectDB from '@/config/connectDB';
import checkAuthToken from '@/utils/checktoken';
import Customer from '@/models/customer.model';
import LabelCall from '@/models/labelCall.model';

const LABEL_CALL_CACHE_TTL_MS = 5 * 60 * 1000;
let labelCallCache = null;
let labelCallCacheAt = 0;

function canManageCallLabel(user) {
    if (!user?.role) return false;
    return (
        user.role.includes('Admin') ||
        user.role.includes('Sale') ||
        user.role.includes('Manager')
    );
}

/** Danh sách thẻ cuộc gọi (đọc DB, không tạo mẫu). */
export async function getLabelCallsForSelect() {
    const user = await checkAuthToken();
    if (!user?.id) return [];
    if (!canManageCallLabel(user)) return [];

    try {
        const now = Date.now();
        if (labelCallCache && now - labelCallCacheAt < LABEL_CALL_CACHE_TTL_MS) {
            return labelCallCache;
        }

        await connectDB();
        const rows = await LabelCall.find().sort({ name: 1 }).lean();
        const data = rows.map((r) => ({ _id: String(r._id), name: r.name }));
        labelCallCache = data;
        labelCallCacheAt = now;
        return data;
    } catch (e) {
        console.error('[getLabelCallsForSelect]', e);
        return [];
    }
}

/**
 * Gán hoặc xóa thẻ cuộc gọi cho khách (một khách tối đa một thẻ).
 * @param {string} customerId
 * @param {string|null|undefined} labelCallId — null/undefined/'' để xóa thẻ
 */
export async function setCustomerCallLabel(customerId, labelCallId) {
    const user = await checkAuthToken();
    if (!user?.id) {
        return { success: false, error: 'Bạn cần đăng nhập để thực hiện hành động này.' };
    }
    if (!canManageCallLabel(user)) {
        return { success: false, error: 'Bạn không có quyền thực hiện chức năng này.' };
    }
    if (!customerId || !mongoose.Types.ObjectId.isValid(customerId)) {
        return { success: false, error: 'Khách hàng không hợp lệ.' };
    }

    const clear =
        labelCallId === null ||
        labelCallId === undefined ||
        String(labelCallId).trim() === '';

    try {
        await connectDB();

        if (clear) {
            const clearResult = await Customer.updateOne(
                { _id: new mongoose.Types.ObjectId(customerId) },
                { $unset: { Call_Label: '' } }
            );
            if (clearResult.modifiedCount === 0) {
                return { success: true, noChange: true, message: 'Khách hàng chưa có thẻ cuộc gọi.' };
            }
            return { success: true, cleared: true, message: 'Đã xóa thẻ cuộc gọi.' };
        }

        if (!mongoose.Types.ObjectId.isValid(labelCallId)) {
            return { success: false, error: 'Thẻ không hợp lệ.' };
        }

        const label = await LabelCall.findById(labelCallId).lean();
        if (!label) {
            return { success: false, error: 'Không tìm thấy thẻ.' };
        }

        const updateResult = await Customer.updateOne(
            { _id: new mongoose.Types.ObjectId(customerId) },
            {
                $set: {
                    Call_Label: {
                        name: label.name,
                        id_call_label: label._id,
                    },
                },
            }
        );
        if (updateResult.modifiedCount === 0) {
            return {
                success: true,
                noChange: true,
                message: 'Thẻ cuộc gọi không thay đổi.',
                data: { id_call_label: String(label._id), name: label.name },
            };
        }

        return {
            success: true,
            assigned: true,
            message: 'Đã gán thẻ cuộc gọi.',
            data: { id_call_label: String(label._id), name: label.name },
        };
    } catch (e) {
        console.error('[setCustomerCallLabel]', e);
        return { success: false, error: 'Lỗi máy chủ khi cập nhật thẻ.' };
    }
}
