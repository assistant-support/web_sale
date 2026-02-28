'use server';

import connectDB from '@/config/connectDB';
import ServiceDetail from '@/models/service_details.model';
import Customer from '@/models/customer.model';
import mongoose from 'mongoose';
import { unstable_cache as nextCache } from 'next/cache';

/**
 * Lấy danh sách đơn chờ duyệt từ service_details với filter thời gian và pagination
 * @param {Object} params - Tham số filter
 * @param {Date} params.fromDate - Ngày bắt đầu (optional)
 * @param {Date} params.toDate - Ngày kết thúc (optional)
 * @param {string} params.sourceId - ID nguồn (optional)
 * @param {string} params.serviceId - ID dịch vụ (optional)
 * @param {number} params.limit - Số lượng đơn cần lấy (default: 10)
 * @param {number} params.skip - Số lượng đơn cần bỏ qua (default: 0)
 * @returns {Promise<{data: Array, total: number}>} Danh sách đơn chờ duyệt với thông tin customer đầy đủ và tổng số
 */
export async function getPendingApprovals(params = {}) {
    try {
        await connectDB();
        
        const { fromDate, toDate, sourceId, serviceId, limit = 10, skip = 0 } = params;
        
        // Build query
        const query = {
            approvalStatus: 'pending'
        };
        
        // Filter theo nguồn
        // Có thể là sourceId (ObjectId) hoặc sourceDetails (string)
        if (sourceId && sourceId !== 'all') {
            // Kiểm tra xem có phải là ObjectId hợp lệ không
            if (mongoose.Types.ObjectId.isValid(sourceId)) {
                // Nếu là ObjectId → filter theo sourceId hoặc source
                query.$or = [
                    { sourceId: new mongoose.Types.ObjectId(sourceId) },
                    { source: new mongoose.Types.ObjectId(sourceId) }
                ];
            } else {
                // Nếu không phải ObjectId → filter theo sourceDetails (string)
                query.sourceDetails = String(sourceId);
            }
        }
        
        // Filter theo dịch vụ
        if (serviceId && serviceId !== 'all') {
            query.serviceId = serviceId;
        }
        
        // Filter theo thời gian tạo đơn (createdAt) nếu có
        // Vì đây là đơn chờ duyệt, nên filter theo createdAt
        // Sử dụng $gte và $lt (không dùng $lte) để chính xác hơn theo gợi ý
        if (fromDate || toDate) {
            query.createdAt = {};
            if (fromDate) {
                // Set thời gian bắt đầu của ngày (00:00:00.000Z)
                // Đảm bảo parse đúng format ISO với timezone UTC
                if (typeof fromDate === 'string' && !fromDate.includes('T')) {
                    // Nếu là string YYYY-MM-DD, thêm T00:00:00.000Z
                    query.createdAt.$gte = new Date(fromDate + 'T00:00:00.000Z');
                } else if (fromDate instanceof Date) {
                    // Nếu là Date object, tạo mới và set về 00:00:00 UTC
                    const from = new Date(fromDate);
                    from.setUTCHours(0, 0, 0, 0);
                    query.createdAt.$gte = from;
                } else {
                    const from = new Date(fromDate);
                    from.setHours(0, 0, 0, 0);
                    query.createdAt.$gte = from;
                }
            }
            if (toDate) {
                // Set thời gian kết thúc: dùng $lt với ngày tiếp theo (00:00:00.000Z)
                // Ví dụ: toDate = 2026-02-19 => $lt = 2026-02-20T00:00:00.000Z
                // Điều này đảm bảo lấy tất cả đơn trong ngày 19/02 (từ 00:00:00 đến 23:59:59)
                if (typeof toDate === 'string' && !toDate.includes('T')) {
                    // Nếu là string YYYY-MM-DD, tính ngày tiếp theo
                    const to = new Date(toDate + 'T00:00:00.000Z');
                    to.setUTCDate(to.getUTCDate() + 1);
                    query.createdAt.$lt = to;
                } else if (toDate instanceof Date) {
                    const to = new Date(toDate);
                    to.setUTCDate(to.getUTCDate() + 1);
                    to.setUTCHours(0, 0, 0, 0);
                    query.createdAt.$lt = to;
                } else {
                    const to = new Date(toDate);
                    to.setDate(to.getDate() + 1);
                    to.setHours(0, 0, 0, 0);
                    query.createdAt.$lt = to;
                }
            }
        }
        
        // Đếm tổng số đơn phù hợp
        const total = await ServiceDetail.countDocuments(query);
        
        // Query từ service_details với pagination
        const pendingDetails = await ServiceDetail.find(query)
            .populate('customerId', 'name phone assignees tags source')
            .populate('serviceId', 'name code price')
            .populate('sourceId', 'name')
            .populate('createdBy', 'name avt')
            .populate('approvedBy', 'name avt')
            .populate('closedBy', 'name avt')
            .populate('payments.receivedBy', 'name avt')
            .populate('commissions.user', 'name avt')
            .populate('costs.createdBy', 'name avt')
            .sort({ createdAt: -1 }) // Sort theo createdAt DESC (mới nhất → cũ nhất)
            .skip(skip)
            .limit(limit)
            .lean();
        
        // Transform data để tương thích với format hiện tại
        const transformed = pendingDetails.map(detail => {
            const customer = detail.customerId || {};
            return {
                customerId: customer._id || detail.customerId,
                name: customer.name || '',
                phone: customer.phone || '',
                assignees: customer.assignees || [],
                tags: customer.tags || [],
                care: [], // Không lấy care logs ở đây để tối ưu
                detail: {
                    _id: detail._id,
                    approvalStatus: detail.approvalStatus,
                    status: detail.status,
                    notes: detail.notes,
                    selectedService: detail.serviceId,
                    pricing: detail.pricing,
                    revenue: detail.revenue,
                    payments: detail.payments || [],
                    commissions: detail.commissions || [],
                    costs: detail.costs || [],
                    amountReceivedTotal: detail.amountReceivedTotal,
                    outstandingAmount: detail.outstandingAmount,
                    closedAt: detail.closedAt,
                    closedBy: detail.closedBy,
                    approvedAt: detail.approvedAt,
                    approvedBy: detail.approvedBy,
                    createdAt: detail.createdAt,
                    createdBy: detail.createdBy,
                    invoiceDriveIds: detail.invoiceDriveIds || [],
                    customerPhotosDriveIds: detail.customerPhotosDriveIds || [],
                    selectedCourse: detail.selectedCourse,
                    interestedServices: detail.interestedServices || [],
                    sourceId: detail.sourceId,
                    sourceDetails: detail.sourceDetails,
                }
            };
        });
        
        return {
            data: JSON.parse(JSON.stringify(transformed)),
            total
        };
    } catch (error) {
        console.error('Error in getPendingApprovals:', error);
        // Fallback: trả về mảng rỗng nếu có lỗi
        return { data: [], total: 0 };
    }
}

/**
 * Lấy danh sách đơn đã duyệt từ service_details với filter và pagination
 * @param {Object} params - Tham số filter
 * @param {Date|string} params.fromDate - Ngày bắt đầu (optional)
 * @param {Date|string} params.toDate - Ngày kết thúc (optional)
 * @param {string} params.sourceId - ID nguồn (optional)
 * @param {string} params.serviceId - ID dịch vụ (optional)
 * @param {number} params.limit - Số lượng đơn cần lấy (default: 10)
 * @param {number} params.skip - Số lượng đơn cần bỏ qua (default: 0)
 * @returns {Promise<{data: Array, total: number}>} Danh sách đơn đã duyệt với thông tin customer đầy đủ và tổng số
 */
export async function getApprovedDeals(params = {}) {
    try {
        await connectDB();
        
        const { fromDate, toDate, sourceId, serviceId, limit = 10, skip = 0 } = params;
        
        // Build query - chỉ lấy đơn đã duyệt và hoàn thành
        const query = {
            status: 'completed',
            approvalStatus: 'approved'
        };
        
        // Filter theo nguồn
        // Có thể là sourceId (ObjectId) hoặc sourceDetails (string)
        if (sourceId && sourceId !== 'all') {
            // Kiểm tra xem có phải là ObjectId hợp lệ không
            if (mongoose.Types.ObjectId.isValid(sourceId)) {
                // Nếu là ObjectId → filter theo sourceId hoặc source
                query.$or = [
                    { sourceId: new mongoose.Types.ObjectId(sourceId) },
                    { source: new mongoose.Types.ObjectId(sourceId) }
                ];
            } else {
                // Nếu không phải ObjectId → filter theo sourceDetails (string)
                query.sourceDetails = String(sourceId);
            }
        }
        
        // Filter theo dịch vụ
        if (serviceId && serviceId !== 'all') {
            query.serviceId = serviceId;
        }
        
        // Filter theo thời gian (sử dụng closedAt với $gte và $lt)
        if (fromDate || toDate) {
            query.closedAt = {};
            if (fromDate) {
                // Set thời gian bắt đầu của ngày (00:00:00.000Z)
                if (typeof fromDate === 'string' && !fromDate.includes('T')) {
                    query.closedAt.$gte = new Date(fromDate + 'T00:00:00.000Z');
                } else if (fromDate instanceof Date) {
                    const from = new Date(fromDate);
                    from.setUTCHours(0, 0, 0, 0);
                    query.closedAt.$gte = from;
                } else {
                    const from = new Date(fromDate);
                    from.setHours(0, 0, 0, 0);
                    query.closedAt.$gte = from;
                }
            }
            if (toDate) {
                // Set thời gian kết thúc: dùng $lt với ngày tiếp theo (00:00:00.000Z)
                if (typeof toDate === 'string' && !toDate.includes('T')) {
                    const to = new Date(toDate + 'T00:00:00.000Z');
                    to.setUTCDate(to.getUTCDate() + 1);
                    query.closedAt.$lt = to;
                } else if (toDate instanceof Date) {
                    const to = new Date(toDate);
                    to.setUTCDate(to.getUTCDate() + 1);
                    to.setUTCHours(0, 0, 0, 0);
                    query.closedAt.$lt = to;
                } else {
                    const to = new Date(toDate);
                    to.setDate(to.getDate() + 1);
                    to.setHours(0, 0, 0, 0);
                    query.closedAt.$lt = to;
                }
            }
        }
        
        // Đếm tổng số đơn phù hợp
        const total = await ServiceDetail.countDocuments(query);
        
        // Query từ service_details với pagination
        const approvedDetails = await ServiceDetail.find(query)
            .populate('customerId', 'name phone assignees tags source care')
            .populate('serviceId', 'name code price')
            .populate('sourceId', 'name')
            .populate('createdBy', 'name avt')
            .populate('approvedBy', 'name avt')
            .populate('closedBy', 'name avt')
            .populate('payments.receivedBy', 'name avt')
            .populate('commissions.user', 'name avt')
            .populate('costs.createdBy', 'name avt')
            .sort({ closedAt: -1 }) // Sort theo closedAt DESC (mới nhất → cũ nhất)
            .skip(skip)
            .limit(limit)
            .lean();
        
        // Transform data để tương thích với format hiện tại
        const transformed = approvedDetails.map(detail => {
            const customer = detail.customerId || {};
            return {
                customerId: customer._id || detail.customerId,
                name: customer.name || '',
                phone: customer.phone || '',
                assignees: customer.assignees || [],
                tags: customer.tags || [],
                care: customer.care || [],
                detail: {
                    _id: detail._id,
                    approvalStatus: detail.approvalStatus,
                    status: detail.status,
                    notes: detail.notes,
                    selectedService: detail.serviceId,
                    pricing: detail.pricing,
                    revenue: detail.revenue,
                    payments: detail.payments || [],
                    commissions: detail.commissions || [],
                    costs: detail.costs || [],
                    amountReceivedTotal: detail.amountReceivedTotal,
                    outstandingAmount: detail.outstandingAmount,
                    closedAt: detail.closedAt,
                    closedBy: detail.closedBy,
                    approvedAt: detail.approvedAt,
                    approvedBy: detail.approvedBy,
                    createdAt: detail.createdAt,
                    createdBy: detail.createdBy,
                    invoiceDriveIds: detail.invoiceDriveIds || [],
                    customerPhotosDriveIds: detail.customerPhotosDriveIds || [],
                    selectedCourse: detail.selectedCourse,
                    interestedServices: detail.interestedServices || [],
                    sourceId: detail.sourceId,
                    sourceDetails: detail.sourceDetails,
                }
            };
        });
        
        return {
            data: JSON.parse(JSON.stringify(transformed)),
            total
        };
    } catch (error) {
        console.error('Error in getApprovedDeals:', error);
        // Fallback: trả về mảng rỗng nếu có lỗi
        return { data: [], total: 0 };
    }
}

