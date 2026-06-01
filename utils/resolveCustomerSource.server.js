import 'server-only';

import mongoose from 'mongoose';
import Form from '@/models/formclient';
import {
    DIRECT_SOURCE_FORM_ID,
    DEFAULT_MANUAL_SOURCE_DETAIL,
} from '@/utils/customerSourceConstants';

function escapeRegex(str) {
    return String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Gán customer.source theo form đã chọn; sourceDetails = tên form (chuẩn hóa từ DB).
 */
export async function resolveCustomerSourceFromFormId(formId) {
    const id = String(formId || '').trim();

    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
        return resolveCustomerSourceFromDetailName(DEFAULT_MANUAL_SOURCE_DETAIL);
    }

    if (id === DIRECT_SOURCE_FORM_ID) {
        return {
            source: new mongoose.Types.ObjectId(DIRECT_SOURCE_FORM_ID),
            sourceDetails: DEFAULT_MANUAL_SOURCE_DETAIL,
            sourceName: 'Trực tiếp',
        };
    }

    const form = await Form.findById(id).select('name').lean();
    if (!form?.name) {
        return resolveCustomerSourceFromDetailName(DEFAULT_MANUAL_SOURCE_DETAIL);
    }

    return {
        source: new mongoose.Types.ObjectId(id),
        sourceDetails: String(form.name).trim(),
        sourceName: 'Trực tiếp',
    };
}

/** Tìm form theo tên nguồn chi tiết; không có thì gắn nguồn cha Trực tiếp. */
export async function resolveCustomerSourceFromDetailName(detailName) {
    const detail = String(detailName || '').trim() || DEFAULT_MANUAL_SOURCE_DETAIL;

    const form = await Form.findOne({
        name: { $regex: `^${escapeRegex(detail)}$`, $options: 'i' },
    })
        .select('_id name')
        .lean();

    if (form?._id) {
        const fid = String(form._id);
        return {
            source: new mongoose.Types.ObjectId(fid),
            sourceDetails: String(form.name).trim(),
            sourceName: fid === DIRECT_SOURCE_FORM_ID ? 'Trực tiếp' : 'Trực tiếp',
        };
    }

    if (detail.toLowerCase() === DEFAULT_MANUAL_SOURCE_DETAIL.toLowerCase()) {
        return {
            source: new mongoose.Types.ObjectId(DIRECT_SOURCE_FORM_ID),
            sourceDetails: DEFAULT_MANUAL_SOURCE_DETAIL,
            sourceName: 'Trực tiếp',
        };
    }

    return {
        source: new mongoose.Types.ObjectId(DIRECT_SOURCE_FORM_ID),
        sourceDetails: detail,
        sourceName: 'Trực tiếp',
    };
}
