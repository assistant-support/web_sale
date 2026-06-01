import 'server-only';

import mongoose from 'mongoose';
import connectDB from '@/config/connectDB';
import Customer from '@/models/customer.model';
import checkAuthToken from '@/utils/checktoken';
import { isSaleOnlyRole, isAdminSaleRestrictedRole } from '@/utils/saleScope';

export async function getAdminSaleScope() {
    const session = await checkAuthToken();
    const roles = session?.role || [];
    const currentUserId = session?.id ? String(session.id) : '';
    const isSaleOnly = isSaleOnlyRole(roles);
    const isAdminSaleRestricted = isAdminSaleRestrictedRole(roles);
    return { session, roles, currentUserId, isSaleOnly, isAdminSaleRestricted };
}

/** ObjectId khách được gán cho sale (assignees.user). */
export async function getCustomerIdsForSale(saleUserId) {
    const uid = String(saleUserId || '').trim();
    if (!uid || !mongoose.Types.ObjectId.isValid(uid)) {
        return [];
    }
    await connectDB();
    const ids = await Customer.find({ 'assignees.user': new mongoose.Types.ObjectId(uid) })
        .distinct('_id')
        .lean();
    return ids.map((id) => new mongoose.Types.ObjectId(String(id)));
}
