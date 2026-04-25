'use server';

import { revalidateTag } from 'next/cache';
import mongoose from 'mongoose';
import connectDB from '@/config/connectDB';
import checkAuthToken from '@/utils/checktoken';
import Customer from '@/models/customer.model';
import LabelCall from '@/models/labelCall.model';

const LABEL_CALL_CACHE_TTL_MS = 5 * 60 * 1000;
let labelCallCache = null;
let labelCallCacheAt = 0;

function revalidateCustomerListCache() {
    try {
        revalidateTag('combined-data');
    } catch {
        // ignore unsupported context
    }
}

function canManageCallLabel(user) {
    if (!user?.role) return false;
    return (
        user.role.includes('Admin') ||
        user.role.includes('Sale') ||
        user.role.includes('Manager')
    );
}

/** Danh sach the cuoc goi (doc DB, khong tao mau). */
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
        const data = rows.map((r) => ({
            _id: String(r._id),
            name: r.name,
            type: r.type || '',
            note: r.note || '',
        }));
        labelCallCache = data;
        labelCallCacheAt = now;
        return data;
    } catch (e) {
        console.error('[getLabelCallsForSelect]', e);
        return [];
    }
}

/**
 * Gan hoac xoa the cuoc goi cho khach (mot khach toi da mot the).
 */
export async function setCustomerCallLabel(customerId, labelCallId) {
    const user = await checkAuthToken();
    if (!user?.id) {
        return { success: false, error: 'Ban can dang nhap de thuc hien hanh dong nay.' };
    }
    if (!canManageCallLabel(user)) {
        return { success: false, error: 'Ban khong co quyen thuc hien chuc nang nay.' };
    }
    if (!customerId || !mongoose.Types.ObjectId.isValid(customerId)) {
        return { success: false, error: 'Khach hang khong hop le.' };
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
                return { success: true, noChange: true, message: 'Khach hang chua co the cuoc goi.' };
            }
            revalidateCustomerListCache();
            return { success: true, cleared: true, message: 'Da xoa the cuoc goi.' };
        }

        if (!mongoose.Types.ObjectId.isValid(labelCallId)) {
            return { success: false, error: 'The khong hop le.' };
        }

        const label = await LabelCall.findById(labelCallId).lean();
        if (!label) {
            return { success: false, error: 'Khong tim thay the.' };
        }

        const updateResult = await Customer.updateOne(
            { _id: new mongoose.Types.ObjectId(customerId) },
            {
                $set: {
                    Call_Label: {
                        name: label.name,
                        type: label.type || '',
                        note: label.note || '',
                        id_call_label: label._id,
                    },
                },
            }
        );
        if (updateResult.modifiedCount === 0) {
            return {
                success: true,
                noChange: true,
                message: 'The cuoc goi khong thay doi.',
                data: { id_call_label: String(label._id), name: label.name, type: label.type || '', note: label.note || '' },
            };
        }

        revalidateCustomerListCache();
        return {
            success: true,
            assigned: true,
            message: 'Da gan the cuoc goi.',
            data: { id_call_label: String(label._id), name: label.name, type: label.type || '', note: label.note || '' },
        };
    } catch (e) {
        console.error('[setCustomerCallLabel]', e);
        return { success: false, error: 'Loi may chu khi cap nhat the.' };
    }
}
