'use server';

import { getPendingApprovals, getApprovedDeals } from './handledata.db';
import { unstable_cache as nextCache } from 'next/cache';

/**
 * Lấy danh sách đơn chờ duyệt với cache
 * @param {Object} params - Tham số filter
 * @param {Date} params.fromDate - Ngày bắt đầu (optional)
 * @param {Date} params.toDate - Ngày kết thúc (optional)
 * @returns {Promise<Array>} Danh sách đơn chờ duyệt
 */
export async function pending_approvals_data(params = {}) {
    // Không cache nếu có filter thời gian (vì thay đổi theo thời gian thực)
    if (params.fromDate || params.toDate) {
        return await getPendingApprovals(params);
    }
    
    // Cache nếu không có filter
    const cachedData = nextCache(
        async () => {
            return await getPendingApprovals(params);
        },
        ['pending-approvals-data'],
        { 
            tags: ['pending-approvals'],
            revalidate: 60 // Cache 60 giây
        }
    );
    return cachedData();
}

/**
 * Lấy danh sách đơn đã duyệt với cache
 * @param {Object} params - Tham số filter
 * @param {Date} params.fromDate - Ngày bắt đầu (optional)
 * @param {Date} params.toDate - Ngày kết thúc (optional)
 * @returns {Promise<Array>} Danh sách đơn đã duyệt
 */
export async function approved_deals_data(params = {}) {
    // Không cache nếu có filter thời gian (vì thay đổi theo thời gian thực)
    if (params.fromDate || params.toDate) {
        return await getApprovedDeals(params);
    }
    
    // Cache nếu không có filter
    const cachedData = nextCache(
        async () => {
            return await getApprovedDeals(params);
        },
        ['approved-deals-data'],
        { 
            tags: ['approved-deals'],
            revalidate: 60 // Cache 60 giây
        }
    );
    return cachedData();
}

