import 'server-only';

import mongoose from 'mongoose';
import Form from '@/models/formclient';
import { DIRECT_SOURCE_FORM_ID } from '@/utils/customerSourceConstants';

export { DIRECT_SOURCE_FORM_ID, customerMatchesSourceFilter } from '@/utils/customerSourceConstants';
function escapeRegex(str) {
    return String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Điều kiện MongoDB lọc khách theo nguồn (param `source` trên URL).
 * - Form ObjectId: khớp customer.source HOẶC customer.sourceDetails = tên form
 *   (khách Trực tiếp + nguồn chi tiết từ dropdown).
 * - Nguồn Trực tiếp (cha): chỉ khớp customer.source.
 * - Chuỗi không phải ObjectId: khớp sourceDetails (kênh tin nhắn).
 */
export async function buildCustomerSourceFilter(sourceParam) {
    if (!sourceParam) return null;

    const raw = String(sourceParam).trim();
    if (!raw) return null;

    if (mongoose.Types.ObjectId.isValid(raw)) {
        const sourceOid = new mongoose.Types.ObjectId(raw);

        if (raw === DIRECT_SOURCE_FORM_ID) {
            return { source: sourceOid };
        }

        const formDoc = await Form.findById(sourceOid).select('name').lean();
        if (formDoc?.name) {
            const nameEscaped = escapeRegex(formDoc.name);
            return {
                $or: [
                    { source: sourceOid },
                    { sourceDetails: { $regex: `^${nameEscaped}$`, $options: 'i' } },
                ],
            };
        }

        return { source: sourceOid };
    }

    if (raw === 'Tin nhắn') {
        return { sourceDetails: { $regex: '^Tin nhắn', $options: 'i' } };
    }

    return { sourceDetails: raw };
}

/** Map điều kiện lọc customer.source → service_details (sourceId / source / sourceDetails). */
export function mapCustomerSourceFilterToServiceDetail(sourceFilter) {
    if (!sourceFilter) return null;

    if (sourceFilter.$or) {
        const branches = [];
        for (const clause of sourceFilter.$or) {
            if (clause.source) {
                branches.push({ sourceId: clause.source }, { source: clause.source });
            } else if (clause.sourceDetails) {
                branches.push({ sourceDetails: clause.sourceDetails });
            }
        }
        return branches.length > 0 ? { $or: branches } : null;
    }

    if (sourceFilter.source) {
        return {
            $or: [{ sourceId: sourceFilter.source }, { source: sourceFilter.source }],
        };
    }

    if (sourceFilter.sourceDetails) {
        return { sourceDetails: sourceFilter.sourceDetails };
    }

    return null;
}
