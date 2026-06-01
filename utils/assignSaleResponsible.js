import 'server-only';

import mongoose from 'mongoose';
import connectDB from '@/config/connectDB';
import Customer from '@/models/customer.model';
import User from '@/models/users';
import { revalidateData } from '@/app/actions/customer.actions';
import { validatePipelineStatusUpdate } from '@/utils/pipelineStatus';

/** Nguồn khách từ tin nhắn / API (Pancake, mes, auto message). */
const MESSAGE_SOURCE_IDS = new Set([
    '6925700a097e2a7b59cd8a4e',
]);

export function isSaleUser(user) {
    if (!user?.role) return false;
    const roles = Array.isArray(user.role) ? user.role : [user.role];
    return roles.some((r) => String(r) === 'Sale');
}

export function isMessageApiCustomer(customer) {
    if (!customer) return false;
    const details = String(customer.sourceDetails || '').trim();
    if (details.toLowerCase().startsWith('tin nhắn')) return true;
    if (customer.id_phone_mes) return true;

    const src = customer.source;
    const srcId = src && typeof src === 'object' ? String(src._id || '') : String(src || '');
    if (MESSAGE_SOURCE_IDS.has(srcId)) return true;

    return false;
}

function pipelineStatusForGroup(group) {
    if (group === 'noi_khoa') return 'noikhoa_3';
    if (group === 'ngoai_khoa') return 'ngoaikhoa_3';
    return 'undetermined_3';
}

async function setSaleAssignee(customer, user, careContent, { replace = false } = {}) {
    const userOid = new mongoose.Types.ObjectId(String(user._id));
    const group = user.group || 'noi_khoa';
    const newStatus = pipelineStatusForGroup(group);

    if (replace) {
        customer.assignees = [];
    }

    const alreadyAssigned = (customer.assignees || []).some(
        (a) => String(a.user) === String(user._id)
    );

    if (!alreadyAssigned) {
        customer.assignees = customer.assignees || [];
        customer.assignees.push({
            user: userOid,
            group,
            assignedAt: new Date(),
        });
    }

    const validatedStatus = validatePipelineStatusUpdate(customer, newStatus);
    if (validatedStatus) {
        customer.pipelineStatus[0] = validatedStatus;
        customer.pipelineStatus[3] = validatedStatus;
    }

    customer.isAutoAssigned = false;
    customer.care = customer.care || [];
    customer.care.push({
        content: careContent,
        createBy: userOid,
        step: 3,
        createAt: new Date(),
    });

    await customer.save();
    try {
        await revalidateData();
    } catch {
        /* ignore */
    }

    return { ok: true, user };
}

/** Người tạo khách (không phải nguồn tin nhắn API) → Sale phụ trách. */
export async function assignCreatorAsSaleResponsible(customerId, creatorUserId) {
    if (!customerId || !creatorUserId) return { ok: false, reason: 'missing_ids' };

    await connectDB();
    const user = await User.findById(creatorUserId).lean();
    if (!user || !isSaleUser(user)) return { ok: false, reason: 'not_sale_role' };

    const customer = await Customer.findById(customerId);
    if (!customer) return { ok: false, reason: 'not_found' };

    if (isMessageApiCustomer(customer)) {
        return { ok: false, reason: 'message_customer' };
    }

    if (customer.assignees?.length > 0) {
        const isCreator = customer.assignees.some(
            (a) => String(a.user) === String(creatorUserId)
        );
        return { ok: isCreator, reason: isCreator ? 'already_creator' : 'already_assigned' };
    }

    customer.saleFirstActionClaimed = true;
    return setSaleAssignee(
        customer,
        user,
        `Gán Sale phụ trách: ${user.name || 'N/A'} (người tạo khách hàng).`
    );
}

/**
 * Khách tin nhắn/API: sau auto-gán, sale đầu tiên thao tác (gọi, lịch, đơn…) được gán lại nếu khác sale auto.
 */
export async function claimSaleOnFirstCustomerAction(customerId, actingUserId, actionLabel = 'Thao tác') {
    if (!customerId || !actingUserId) return { ok: false, reason: 'missing_ids' };

    await connectDB();
    const user = await User.findById(actingUserId).lean();
    if (!user || !isSaleUser(user)) return { ok: false, reason: 'not_sale_role' };

    const customer = await Customer.findById(customerId);
    if (!customer) return { ok: false, reason: 'not_found' };

    if (!isMessageApiCustomer(customer)) {
        if (customer.assignees?.length > 0) {
            return { ok: false, reason: 'already_assigned' };
        }
        customer.saleFirstActionClaimed = true;
        return setSaleAssignee(
            customer,
            user,
            `Gán Sale phụ trách: ${user.name || 'N/A'} (${actionLabel}).`
        );
    }

    if (customer.saleFirstActionClaimed) {
        return { ok: false, reason: 'already_claimed' };
    }

    customer.saleFirstActionClaimed = true;
    const label = String(actionLabel || 'Thao tác').trim();
    return setSaleAssignee(
        customer,
        user,
        `Gán Sale phụ trách: ${user.name || 'N/A'} — ${label} (khách từ tin nhắn/API, thao tác đầu tiên).`,
        { replace: true }
    );
}

/** Đánh dấu khách tin nhắn vừa auto-gán (chờ sale thao tác đầu tiên có thể đổi người). */
export async function markMessageCustomerAutoAssigned(customerId) {
    if (!customerId) return;
    await connectDB();
    await Customer.updateOne(
        { _id: customerId },
        { $set: { isAutoAssigned: true, saleFirstActionClaimed: false } }
    );
}
