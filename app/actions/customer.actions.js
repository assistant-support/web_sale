'use server';
import { unstable_cache as nextCache, revalidateTag } from 'next/cache';
import connectDB from "@/config/connectDB";
import Customer from "@/models/customer.model";
import mongoose from 'mongoose';
import checkAuthToken from '@/utils/checktoken';
import User from '@/models/users';
import '@/models/zalo.model' // Giữ lại nếu Zalo Account vẫn liên quan đến Customer
import ScheduledJob from "@/models/schedule";
import { reloadCustomers } from '@/data/customers/wraperdata.db';
import Service from '@/models/services.model';
import ServiceDetail from '@/models/service_details.model';
import autoAssignForCustomer from '@/utils/autoAssign';
import { uploadFileToDrive } from '@/function/drive/image';
import { validatePipelineStatusUpdate } from '@/utils/pipelineStatus';
import { parseCustomerCode, isCustomerCodeAvailable } from '@/utils/customerCode';
// Các import không liên quan đến Student đã được bỏ đi
// import { ProfileDefault, statusStudent } from '@/data/default'; // Không dùng cho Customer
// import { getZaloUid } from '@/function/drive/appscript'; // Không dùng cho Customer (nếu không chuyển đổi)

/**
 * Build history_service từ serviceDetails (structure per history_service.md).
 * Format: { "Service Name": ["Course Name 1", "Course Name 2", ...] }
 * Deduplication via Sets; skips incomplete records (missing serviceName or courseName).
 */
function buildHistoryService(serviceDetails = [], services = []) {
    if (!Array.isArray(serviceDetails) || serviceDetails.length === 0) {
        return {};
    }

    // Tạo map serviceId -> serviceName
    const serviceMap = new Map();
    services.forEach((svc) => {
        if (svc?._id) {
            serviceMap.set(String(svc._id), (svc.name || '').trim());
        }
    });

    // Nhóm theo tên dịch vụ, mỗi dịch vụ có Set các liệu trình (tự động loại bỏ trùng)
    const grouped = {}; // { "Tên dịch vụ": Set(["Liệu trình 1", "Liệu trình 2"]) }

  

    serviceDetails.forEach((detail, index) => {
        if (!detail) {
            return;
        }
        
        
        
        // serviceId: từ serviceId (snapshot) hoặc selectedService (per history_service.md)
        let serviceId = null;
        if (detail.serviceId) {
            serviceId = typeof detail.serviceId === 'object' && detail.serviceId !== null
                ? String(detail.serviceId._id ?? detail.serviceId.$oid ?? detail.serviceId)
                : String(detail.serviceId);
        }
        if (!serviceId && detail.selectedService) {
            if (typeof detail.selectedService === 'string') {
                serviceId = detail.selectedService;
            } else if (detail.selectedService._id) {
                serviceId = String(detail.selectedService._id);
            }
        }
        if (!serviceId) return;

        const serviceName = serviceMap.get(serviceId) || detail.selectedService?.name || '';
        const courseName = detail.selectedCourse?.name || '';

        // Skip incomplete records (missing serviceName or courseName)
        if (!serviceName || !courseName) return;

        // Khởi tạo Set cho dịch vụ nếu chưa có
        if (!grouped[serviceName]) {
            grouped[serviceName] = new Set();
        }

        // Thêm liệu trình vào Set (tự động loại bỏ trùng lặp)
        grouped[serviceName].add(courseName);
        
    });

    // Chuyển Set thành Array (mảng với index 0, 1, 2, ...)
    const historyService = {};
    Object.keys(grouped).forEach((serviceName) => {
        historyService[serviceName] = Array.from(grouped[serviceName]);
    });

   
    return historyService;
}

/**
 * Đồng bộ history_service từ serviceDetails cho 1 customer
 */
export async function syncHistoryService(customerId) {
    try {
        await connectDB();
        if (!mongoose.Types.ObjectId.isValid(customerId)) {
            return { success: false, error: 'customerId không hợp lệ.' };
        }

        const customerDoc = await Customer.findById(customerId)
            .populate('serviceDetails.selectedService', 'name')
            .lean();

        if (!customerDoc) {
            return { success: false, error: 'Không tìm thấy khách hàng.' };
        }

       
        const serviceIds = new Set();
        customerDoc.serviceDetails?.forEach((detail) => {
            const raw = detail?.serviceId ?? detail?.selectedService;
            if (!raw) return;
            const idStr = typeof raw === 'object' && raw !== null ? String(raw._id ?? raw.$oid ?? raw) : String(raw);
            if (idStr && mongoose.Types.ObjectId.isValid(idStr)) serviceIds.add(idStr);
        });

        
        const services = await Service.find({
            _id: { $in: Array.from(serviceIds) },
        })
            .select('name')
            .lean();

        
        const history = buildHistoryService(
            customerDoc.serviceDetails || [],
            services
        );

        
        // Sử dụng updateOne với $set để lưu Mixed type (giống như cover_customer)
        const updateResult = await Customer.updateOne(
            { _id: customerDoc._id },
            { $set: { history_service: history || {} } }
        );

        
        
        // Đợi một chút để đảm bảo database đã cập nhật
        await new Promise(resolve => setTimeout(resolve, 100));
        
        // Kiểm tra lại document sau save (không dùng lean để xem document thật)
        const afterSave = await Customer.findById(customerDoc._id);
        
        // Verify sau khi update - load lại document để kiểm tra
        const verifyDoc = await Customer.findById(customerDoc._id).lean();
        

        return { success: true, history_service: history };
    } catch (error) {
        console.error('❌ [syncHistoryService] Lỗi:', error);
        return {
            success: false,
            error: error?.message || 'Lỗi khi đồng bộ history_service.',
        };
    }
}

export async function getCombinedData(params) {
    const cachedData = nextCache(
        async (currentParams) => {
            await connectDB();

            const page = Number(currentParams.page) || 1;
            const limit = Number(currentParams.limit) || 10;
            const query = currentParams.query || '';
            const skip = (page - 1) * limit;

            const filterConditions = [];

            // Tìm kiếm theo tên/SĐT
            if (query) {
                filterConditions.push({
                    $or: [
                        { name: { $regex: query, $options: 'i' } },
                        { phone: { $regex: query, $options: 'i' } },
                        { customerCode: { $regex: query, $options: 'i' } },
                    ],
                });
            }

            let sourceIndexHint = null;

            // Lọc theo nguồn
            if (currentParams.source) {
                // Kiểm tra xem có phải là ObjectId hợp lệ không (nguồn thường)
                if (mongoose.Types.ObjectId.isValid(currentParams.source)) {
                    filterConditions.push({ source: new mongoose.Types.ObjectId(currentParams.source) });
                    sourceIndexHint = 'source_1';
                } else {
                    // Nếu không phải ObjectId, có thể là sourceDetails (nguồn tin nhắn)
                    const sourceValue = String(currentParams.source);
                    
                    // Nếu filter theo "Tin nhắn", lấy tất cả sourceDetails bắt đầu bằng "Tin nhắn"
                    if (sourceValue === 'Tin nhắn') {
                        filterConditions.push({
                            sourceDetails: { $regex: '^Tin nhắn', $options: 'i' }
                        });
                    } else {
                        // Các sourceDetails khác: filter chính xác
                        filterConditions.push({ sourceDetails: sourceValue });
                    }
                    sourceIndexHint = 'sourceDetails_1';
                }
            }

            // Lọc theo TRẠNG THÁI dựa trên phần tử đầu tiên pipelineStatus[0]
            // + fallback legacy (bỏ hậu tố _1/_2/... nếu còn dữ liệu cũ)
            if (currentParams.pipelineStatus) {
                const v = String(currentParams.pipelineStatus);
                const legacy = v.replace(/_\d+$/, ''); // "new_unconfirmed_1" -> "new_unconfirmed"
                filterConditions.push({
                    $or: [{ 'pipelineStatus.0': v }, { 'pipelineStatus.0': legacy }],
                });
            }

            // Lọc theo DỊCH VỤ QUAN TÂM (tags)
            if (currentParams.tags) {
                if (currentParams.tags === 'null') {
                    filterConditions.push({
                        $or: [{ tags: { $exists: false } }, { tags: null }, { tags: { $size: 0 } }],
                    });
                } else {
                    const tagsAsObjectIds = currentParams.tags
                        .split(',')
                        .map((id) => id.trim())
                        .filter((id) => mongoose.Types.ObjectId.isValid(id))
                        .map((id) => new mongoose.Types.ObjectId(id));
                    if (tagsAsObjectIds.length > 0) {
                        filterConditions.push({ tags: { $in: tagsAsObjectIds } });
                    }
                }
            }

            // Lọc theo người phụ trách trong mảng assignees
            if (currentParams.assignee && mongoose.Types.ObjectId.isValid(currentParams.assignee)) {
                filterConditions.push({ 'assignees.user': new mongoose.Types.ObjectId(currentParams.assignee) });
            }

            // Zalo phase
            if (currentParams.zaloPhase) {
                filterConditions.push({ zaloPhase: currentParams.zaloPhase });
            }

            // Khoảng ngày tạo
            if (currentParams.startDate && currentParams.endDate) {
                const startDate = new Date(currentParams.startDate);
                startDate.setHours(0, 0, 0, 0);
                const endDate = new Date(currentParams.endDate);
                endDate.setHours(23, 59, 59, 999);
                filterConditions.push({ createAt: { $gte: startDate, $lte: endDate } });
            }

            // Lọc theo khu vực (areaCustomer)
            if (currentParams.areaCustomer && mongoose.Types.ObjectId.isValid(currentParams.areaCustomer)) {
                // Lấy danh sách id_customer từ area_customer
                const AreaCustomer = (await import('@/models/area_customer.model')).default;
                const areaCustomer = await AreaCustomer.findById(currentParams.areaCustomer).lean();
                if (areaCustomer && areaCustomer.id_customer && Array.isArray(areaCustomer.id_customer) && areaCustomer.id_customer.length > 0) {
                    // Chuyển đổi id_customer thành ObjectId
                    const customerIds = areaCustomer.id_customer
                        .filter(id => mongoose.Types.ObjectId.isValid(id))
                        .map(id => new mongoose.Types.ObjectId(id));
                    if (customerIds.length > 0) {
                        filterConditions.push({ _id: { $in: customerIds } });
                    } else {
                        // Nếu không có customer nào trong khu vực, trả về kết quả rỗng
                        filterConditions.push({ _id: { $in: [] } });
                    }
                } else {
                    // Nếu khu vực không có customer nào, trả về kết quả rỗng
                    filterConditions.push({ _id: { $in: [] } });
                }
            }

            // Lọc theo tháng sinh (birthMonth)
            if (currentParams.birthMonth) {
                const month = parseInt(currentParams.birthMonth);
                if (month >= 1 && month <= 12) {
                    console.log('🔍 [getCombinedData] Lọc theo tháng sinh:', month);
                    
                    // Lấy danh sách customer IDs từ Filter_customer
                    const FilterCustomer = (await import('@/models/filter_customer.model')).default;
                    
                    // Đảm bảo collection tồn tại
                    if (!FilterCustomer.collection) {
                        await FilterCustomer.createCollection();
                    }
                    
                    // Thử query trực tiếp từ database collection trước
                    // Thử cả 2 tên collection: Fillter_customer (có thể có typo) và Filter_customer
                    const db = mongoose.connection.db;
                    let filterData = [];
                    
                    if (db) {
                        // Thử Fillter_customer trước (có thể có typo)
                        let directCollection = db.collection('Fillter_customer');
                        let directCount = await directCollection.countDocuments({});
                       
                        // Nếu không có, thử Filter_customer
                        if (directCount === 0) {
                            directCollection = db.collection('Filter_customer');
                            directCount = await directCollection.countDocuments({});
                            }
                        
                        if (directCount > 0) {
                            filterData = await directCollection.find({}).toArray();
                            
                        }
                    }
                    
                    // Nếu không có data từ direct query, thử dùng model
                    if (!filterData || filterData.length === 0) {
                        filterData = await FilterCustomer.find({}).lean();
                        
                    }
                    
                    // Merge tất cả documents để lấy đầy đủ customer IDs cho tháng đó
                    const monthKey = `month${month}`;
                    const customerIds = new Set();
                    
                    if (Array.isArray(filterData)) {
                        filterData.forEach(doc => {
                            if (doc[monthKey] && Array.isArray(doc[monthKey])) {
                                doc[monthKey].forEach(id => {
                                    const idStr = String(id);
                                    if (mongoose.Types.ObjectId.isValid(idStr)) {
                                        customerIds.add(idStr);
                                    }
                                });
                            }
                        });
                    }
                    
                   
                    if (customerIds.size > 0) {
                        // Chuyển đổi thành ObjectId array
                        const customerIdsArray = Array.from(customerIds)
                            .map(id => new mongoose.Types.ObjectId(id));
                        filterConditions.push({ _id: { $in: customerIdsArray } });
                        
                    } else {
                        // Nếu không có customer nào sinh vào tháng đó, trả về kết quả rỗng
                        console.log('⚠️ [getCombinedData] Không có customer nào cho tháng', month);
                        filterConditions.push({ _id: { $in: [] } });
                    }
                }
            }

            // Lọc theo thẻ LEAD/NOT_LEAD (conversation lead status): khách hàng có sourceDetails + name trùng với bản ghi đã gán thẻ
            if (currentParams.leadStatusLabelId && mongoose.Types.ObjectId.isValid(currentParams.leadStatusLabelId)) {
                const ConversationLeadStatus = (await import('@/models/conversationLeadStatus.model')).default;
                const leadStatuses = await ConversationLeadStatus.find({
                    labelId: new mongoose.Types.ObjectId(currentParams.leadStatusLabelId),
                    $and: [
                        { pageDisplayName: { $exists: true, $ne: null, $ne: '' } },
                        { name: { $exists: true, $ne: null, $ne: '' } },
                    ],
                })
                    .select('pageDisplayName name')
                    .lean();
                const pairs = leadStatuses.map((s) => ({ sourceDetails: s.pageDisplayName, name: s.name }));
                if (pairs.length > 0) {
                    filterConditions.push({ $or: pairs });
                } else {
                    filterConditions.push({ _id: { $in: [] } });
                }
            }

            const matchStage =
                filterConditions.length > 0 ? { $match: { $and: filterConditions } } : { $match: {} };

            // Pipeline tổng hợp (giữ nguyên logic hiện tại)
            const pipeline = [
                matchStage,
                { $lookup: { from: 'forms', localField: 'source', foreignField: '_id', as: 'sourceInfo' } },
                { $unwind: { path: '$sourceInfo', preserveNullAndEmptyArrays: true } },
                {
                    $addFields: {
                        sourceName: '$sourceInfo.name',
                        lastCareNote: { $last: '$care' },
                    },
                },
                // Lấy thẻ dịch vụ (tags) để hiển thị tên
                { $lookup: { from: 'services', localField: 'tags', foreignField: '_id', as: 'tags' } },
                { $project: { sourceInfo: 0 } },
                { $sort: { createAt: -1 } },
                {
                    $facet: {
                        paginatedResults: [{ $skip: skip }, { $limit: limit }],
                        totalCount: [{ $count: 'count' }],
                    },
                },
            ];

            const aggregateQuery = Customer.aggregate(pipeline);
            if (sourceIndexHint) {
                aggregateQuery.option({ hint: sourceIndexHint });
            }
            const results = await aggregateQuery.exec();
            let paginatedData = results[0]?.paginatedResults || [];

            // ===== Populate user cho care & assignees (giữ nguyên) =====
            if (paginatedData.length > 0) {
                const userIds = new Set();

                paginatedData.forEach((customer) => {
                    customer.care?.forEach((note) => {
                        if (note.createBy) userIds.add(String(note.createBy));
                    });
                    customer.assignees?.forEach((assignment) => {
                        if (assignment.user) userIds.add(String(assignment.user));
                    });
                });

                if (userIds.size > 0) {
                    const users = await User.find({ _id: { $in: Array.from(userIds) } })
                        .select('name avt')
                        .lean();
                    const userMap = new Map(users.map((u) => [String(u._id), u]));

                    paginatedData.forEach((customer) => {
                        customer.ccare = customer.care; // no-op (giữ)
                        customer.care?.forEach((note) => {
                            if (note.createBy && userMap.has(String(note.createBy))) {
                                note.createBy = userMap.get(String(note.createBy));
                            }
                        });
                        if (
                            customer.lastCareNote?.createBy &&
                            userMap.has(String(customer.lastCareNote.createBy))
                        ) {
                            customer.lastCareNote.createBy = userMap.get(String(customer.lastCareNote.createBy));
                        }
                        customer.assignees?.forEach((assignment) => {
                            if (assignment.user && userMap.has(String(assignment.user))) {
                                assignment.user = userMap.get(String(assignment.user));
                            }
                        });
                    });
                }
            }

            // ====== Bổ sung: populate đầy đủ serviceDetails ======
            // Thu thập ID Users & Services từ serviceDetails để query 1 lần
            const sdUserIds = new Set();
            const sdServiceIds = new Set();

            const collectFromServiceDetail = (sd) => {
                // Users
                if (sd.closedBy) sdUserIds.add(String(sd.closedBy));
                if (sd.approvedBy) sdUserIds.add(String(sd.approvedBy));
                (sd.payments || []).forEach((p) => {
                    if (p.receivedBy) sdUserIds.add(String(p.receivedBy));
                });
                (sd.commissions || []).forEach((cm) => {
                    if (cm.user) sdUserIds.add(String(cm.user));
                });
                (sd.costs || []).forEach((c) => {
                    if (c.createdBy) sdUserIds.add(String(c.createdBy));
                });

                // Services — dùng serviceId của snapshot (customers) để nhóm/hiển thị đúng sau khi sửa đơn
                if (sd.serviceId) sdServiceIds.add(String(sd.serviceId));
                if (sd.selectedService) sdServiceIds.add(String(sd.selectedService));
                (sd.interestedServices || []).forEach((sid) => sdServiceIds.add(String(sid)));
            };

            paginatedData.forEach((customer) => {
                const list = Array.isArray(customer.serviceDetails)
                    ? customer.serviceDetails
                    : customer.serviceDetails
                        ? [customer.serviceDetails]
                        : [];
                list.forEach(collectFromServiceDetail);
            });

            // Query users/services một lần
            let sdUserMap = new Map();
            let sdServiceMap = new Map();
            if (sdUserIds.size > 0) {
                const users = await User.find({ _id: { $in: Array.from(sdUserIds) } })
                    .select('name avt')
                    .lean();
                sdUserMap = new Map(users.map((u) => [String(u._id), u]));
            }
            if (sdServiceIds.size > 0) {
                const services = await Service.find({ _id: { $in: Array.from(sdServiceIds) } })
                    .select('name code price')
                    .lean();
                sdServiceMap = new Map(services.map((s) => [String(s._id), s]));
            }

            // Lấy pricing + name_CTKM, idCTKM từ collection service_details (nguồn đúng cho giá gốc/giảm giá/thành tiền)
            const sdDetailIds = new Set();
            paginatedData.forEach((customer) => {
                const list = Array.isArray(customer.serviceDetails)
                    ? customer.serviceDetails
                    : customer.serviceDetails ? [customer.serviceDetails] : [];
                list.forEach((sd) => {
                    const id = sd?.serviceDetailId ?? sd?._id;
                    if (id) {
                        const idStr = typeof id === 'object' && id !== null ? String(id._id ?? id.$oid ?? id) : String(id);
                        if (idStr && mongoose.Types.ObjectId.isValid(idStr)) sdDetailIds.add(idStr);
                    }
                });
            });
            let sdPricingMap = new Map();
            if (sdDetailIds.size > 0) {
                const details = await ServiceDetail.find({ _id: { $in: Array.from(sdDetailIds).map((id) => new mongoose.Types.ObjectId(id)) } })
                    .select('pricing name_CTKM idCTKM')
                    .lean();
                details.forEach((doc) => {
                    sdPricingMap.set(String(doc._id), { pricing: doc.pricing, name_CTKM: doc.name_CTKM, idCTKM: doc.idCTKM });
                });
            }

            // Map dữ liệu vào từng serviceDetails
            paginatedData.forEach((customer) => {
                const list = Array.isArray(customer.serviceDetails)
                    ? customer.serviceDetails
                    : customer.serviceDetails
                        ? [customer.serviceDetails]
                        : [];

                // Gán lại đã map → đảm bảo luôn là mảng trong output
                customer.serviceDetails = list.map((sd) => {
                    const cloned = { ...sd };

                    // Pricing + CTKM: ưu tiên từ service_details (nguồn đúng)
                    const sdId = sd?.serviceDetailId ?? sd?._id;
                    const sdIdStr = sdId != null ? (typeof sdId === 'object' ? String(sdId._id ?? sdId.$oid ?? sdId) : String(sdId)) : null;
                    if (sdIdStr && sdPricingMap.has(sdIdStr)) {
                        const fromDetail = sdPricingMap.get(sdIdStr);
                        if (fromDetail.pricing) cloned.pricing = fromDetail.pricing;
                        if (fromDetail.name_CTKM !== undefined) cloned.name_CTKM = fromDetail.name_CTKM;
                        if (fromDetail.idCTKM !== undefined) cloned.idCTKM = fromDetail.idCTKM;
                    }

                    // Users
                    if (cloned.closedBy && sdUserMap.has(String(cloned.closedBy))) {
                        cloned.closedBy = sdUserMap.get(String(cloned.closedBy));
                    }
                    if (cloned.approvedBy && sdUserMap.has(String(cloned.approvedBy))) {
                        cloned.approvedBy = sdUserMap.get(String(cloned.approvedBy));
                    }
                    if (Array.isArray(cloned.payments)) {
                        cloned.payments = cloned.payments.map((p) => {
                            const cp = { ...p };
                            if (cp.receivedBy && sdUserMap.has(String(cp.receivedBy))) {
                                cp.receivedBy = sdUserMap.get(String(cp.receivedBy));
                            }
                            return cp;
                        });
                    }
                    if (Array.isArray(cloned.commissions)) {
                        cloned.commissions = cloned.commissions.map((cm) => {
                            const ccm = { ...cm };
                            if (ccm.user && sdUserMap.has(String(ccm.user))) {
                                ccm.user = sdUserMap.get(String(ccm.user));
                            }
                            return ccm;
                        });
                    }
                    if (Array.isArray(cloned.costs)) {
                        cloned.costs = cloned.costs.map((c) => {
                            const cc = { ...c };
                            if (cc.createdBy && sdUserMap.has(String(cc.createdBy))) {
                                cc.createdBy = sdUserMap.get(String(cc.createdBy));
                            }
                            return cc;
                        });
                    }

                    // Services — ưu tiên serviceId từ snapshot (customers) để tên dịch vụ khớp nhóm
                    const serviceIdForLookup = cloned.serviceId || cloned.selectedService;
                    const sid = serviceIdForLookup && (typeof serviceIdForLookup === 'object' ? serviceIdForLookup._id ?? serviceIdForLookup : serviceIdForLookup);
                    if (sid && sdServiceMap.has(String(sid))) {
                        cloned.selectedService = sdServiceMap.get(String(sid));
                    }
                    if (cloned.selectedService && !cloned.serviceId) cloned.serviceId = cloned.selectedService._id;
                    if (Array.isArray(cloned.interestedServices)) {
                        cloned.interestedServices = cloned.interestedServices
                            .map((sid) => sdServiceMap.get(String(sid)))
                            .filter(Boolean); // giữ các service tìm thấy
                    }

                    return cloned;
                });
            });

            // Kết quả cuối
            const plainData = JSON.parse(JSON.stringify(paginatedData));
            return {
                data: plainData,
                total: results[0]?.totalCount[0]?.count || 0,
            };
        },
        ['data-by-type'],
        { tags: ['combined-data'], revalidate: 3600 }
    );

    return cachedData(params);
}


export async function revalidateData() {
    try {
        revalidateTag('combined-data');
    } catch (e) {
        // Ignore if called in an unsupported context (e.g., during render)
    }
    try {
        await reloadCustomers();
    } catch (e) {
        // Best-effort background reload; ignore errors
    }
}

export async function updateCustomerInfo(previousState, formData) {
    if (!formData) {
        return { success: false, error: 'Không nhận được dữ liệu từ form.' };
    }

    const id = formData.get('_id');
    if (!id) return { success: false, error: 'Thiếu ID khách hàng.' };

    try {
        
        await connectDB();

        // Xử lý upload ảnh nếu có (giống logic trong closeServiceAction)
        const coverImage = formData.get('cover_customer');
        let coverCustomerId = formData.get('cover_customer_id') || null;
        
        // Kiểm tra nếu có file ảnh được upload (kiểm tra size > 0 giống closeServiceAction)
        if (coverImage && coverImage.size > 0) {
            try {
                const CUSTOMER_IMAGE_FOLDER_ID = '1QllmKTdN6hYg5hBKXMojZf_dwjiNTPAl';
                const uploadedFile = await uploadFileToDrive(coverImage, CUSTOMER_IMAGE_FOLDER_ID);
                if (uploadedFile?.id) {
                    coverCustomerId = uploadedFile.id;  // ← Lấy ID từ kết quả upload
                    
                } else {
                    console.error('❌ Upload ảnh khách hàng thất bại - không có ID trả về');
                }
            } catch (uploadError) {
                console.error('❌ Lỗi khi upload ảnh khách hàng:', uploadError);
                // Không throw lỗi, tiếp tục cập nhật các trường khác
            }
        }

        // Lấy document (giống closeServiceAction - không dùng findByIdAndUpdate)
        const customerDoc = await Customer.findById(id);
        if (!customerDoc) {
            return { success: false, error: 'Không tìm thấy khách hàng.' };
        }

        // Cập nhật các trường cơ bản
        const name = formData.get('name');
        const email = formData.get('email');
        const area = formData.get('area');
        const Id_area_customer = formData.get('Id_area_customer') || null; // _id của area_customer (hoặc null nếu xóa)
        const bd = formData.get('bd');
        const tags = formData.getAll('tags');
        const service_start_date = formData.get('service_start_date');
        const service_last_date = formData.get('service_last_date');
        const customerCodeInput = formData.get('customerCode');

        // Lấy khu vực cũ (là _id) để xóa customer khỏi mảng id_customer
        const oldAreaCustomerId = customerDoc.Id_area_customer;
        // Lấy bd cũ để cập nhật Fillter_customer
        const oldBd = customerDoc.bd ? new Date(customerDoc.bd) : null;

        

        // ===== customerCode (mã khách hàng) =====
        // NORMAL: mã do hệ thống gán khi Thêm khách lẻ — không cho đổi sang mã khác (giữ nguyên nếu trùng).
        // TN: hệ thống tự tạo từ nguồn khác — cho phép sửa.
        // NORMAL_EDIT: nhân viên gán/sửa (kể cả từ NULL, hoặc sửa nhầm) — luôn cho phép sửa lại.
        if (customerCodeInput !== undefined) {
            const raw = String(customerCodeInput ?? '').trim();
            if (raw !== '') {
                const parsed = parseCustomerCode(raw);
                if (!parsed) {
                    return { success: false, error: 'Mã khách hàng không đúng định dạng' };
                }

                const canonical = parsed.canonicalCustomerCode;
                const oldCode =
                    customerDoc.customerCode && String(customerDoc.customerCode).trim() !== ''
                        ? String(customerDoc.customerCode).trim()
                        : '';
                const existingType = customerDoc.customerCodeType;

                if (existingType === 'NORMAL' && oldCode && canonical !== oldCode) {
                    return { success: false, error: 'Mã khách hàng này không được phép sửa.' };
                }

                const available = await isCustomerCodeAvailable(canonical, customerDoc._id);
                if (!available) {
                    return { success: false, error: 'Mã này đã tồn tại trong hệ thống - hãy tạo mã khác' };
                }

                customerDoc.customerCode = canonical;

                if (parsed.customerCodeType === 'TN') {
                    customerDoc.customerCodeType = 'TN';
                    customerDoc.customerCodeNumber = parsed.customerCodeNumber;
                } else {
                    // Định dạng KH-xxxxx (parser trả về NORMAL)
                    if (existingType === 'NORMAL' && oldCode && canonical === oldCode) {
                        customerDoc.customerCodeNumber = parsed.customerCodeNumber;
                    } else if (existingType === undefined && oldCode && canonical === oldCode) {
                        // Bản ghi cũ chưa có customerCodeType: không đổi mã thì không gán NORMAL_EDIT
                        customerDoc.customerCodeNumber = parsed.customerCodeNumber;
                    } else {
                        customerDoc.customerCodeType = 'NORMAL_EDIT';
                        customerDoc.customerCodeNumber = parsed.customerCodeNumber;
                    }
                }
            }
        }

        if (name) customerDoc.name = name;
        if (email !== undefined) customerDoc.email = email || null;
        if (area !== undefined) customerDoc.area = area || null;
        
        // Cập nhật Id_area_customer với _id của area_customer (luôn cập nhật, kể cả khi null/empty)
        customerDoc.Id_area_customer = Id_area_customer;
        
        // Xử lý cập nhật bd (birth date)
        let newBd = null;
        let bdChanged = false;
        
        // Kiểm tra xem bd có được gửi lên trong formData không
        if (formData.has('bd')) {
            if (bd && bd.trim() !== '') {
                // Có giá trị bd mới
                newBd = new Date(bd);
                if (!isNaN(newBd.getTime())) {
                    // So sánh với bd cũ để xem có thay đổi không
                    if (!oldBd || oldBd.getTime() !== newBd.getTime()) {
                        customerDoc.bd = newBd;
                        bdChanged = true;
                        
                    } else {
                        // Giá trị không thay đổi, không cần cập nhật
                        console.log('ℹ️ [updateCustomerInfo] bd không thay đổi');
                    }
                }
            } else {
                // bd bị xóa (chuỗi rỗng)
                if (oldBd) {
                    customerDoc.bd = null;
                    bdChanged = true;
                    
                }
            }
        }
        
        if (tags && tags.length > 0) customerDoc.tags = tags;
        
        // Cập nhật lịch sử sử dụng dịch vụ
        if (service_start_date !== undefined) {
            customerDoc.service_start_date = service_start_date ? new Date(service_start_date) : null;
        }
        if (service_last_date !== undefined) {
            customerDoc.service_last_date = service_last_date ? new Date(service_last_date) : null;
        }

        // Lưu các trường khác bằng .save()
        await customerDoc.save();
        
        // Cập nhật Fillter_customer nếu bd thay đổi
        if (bdChanged) {
            const { updateFilterCustomer } = await import('@/utils/updateFilterCustomer');
            updateFilterCustomer(id, newBd, oldBd).catch(err => {
                console.error('[updateCustomerInfo] Lỗi khi cập nhật Fillter_customer:', err);
            });
        }

        // Cập nhật mảng id_customer trong area_customer
        try {
            const AreaCustomer = (await import('@/models/area_customer.model')).default;
            
            // Xóa customer khỏi mảng id_customer của khu vực cũ (nếu có thay đổi hoặc xóa)
            if (oldAreaCustomerId && oldAreaCustomerId !== Id_area_customer && mongoose.Types.ObjectId.isValid(oldAreaCustomerId)) {
                const pullResult = await AreaCustomer.updateOne(
                    { _id: new mongoose.Types.ObjectId(oldAreaCustomerId) },
                    { $pull: { id_customer: new mongoose.Types.ObjectId(id) } }
                );
                
            }

            // Thêm customer vào mảng id_customer của khu vực mới (nếu có chọn khu vực mới)
            if (Id_area_customer && mongoose.Types.ObjectId.isValid(Id_area_customer)) {
                const updateResult = await AreaCustomer.updateOne(
                    { _id: new mongoose.Types.ObjectId(Id_area_customer) },
                    { 
                        $addToSet: { id_customer: new mongoose.Types.ObjectId(id) } // $addToSet để tránh trùng lặp
                    }
                );
                
            } else if (Id_area_customer) {
                console.warn('⚠️ [updateCustomerInfo] Id_area_customer không phải là ObjectId hợp lệ:', Id_area_customer);
            } else {
                // Nếu Id_area_customer là null/empty, chỉ xóa khỏi khu vực cũ (đã xử lý ở trên)
                console.log('ℹ️ [updateCustomerInfo] Không có khu vực mới được chọn, chỉ xóa khỏi khu vực cũ (nếu có)');
            }
        } catch (areaError) {
            console.error('❌ [updateCustomerInfo] Lỗi khi cập nhật area_customer:', areaError);
            // Không throw lỗi, tiếp tục xử lý các bước khác
        }

        // Cập nhật cover_customer bằng updateOne trực tiếp (để tránh vấn đề với Mongoose)
        if (coverCustomerId) {
            console.log('💾 [updateCustomerInfo] Cập nhật cover_customer bằng updateOne:', coverCustomerId);
            const updateResult = await Customer.updateOne(
                { _id: id },
                { $set: { cover_customer: coverCustomerId } }
            );
            console.log('✅ [updateCustomerInfo] Kết quả updateOne:', {
                matchedCount: updateResult.matchedCount,
                modifiedCount: updateResult.modifiedCount
            });
        } else if (formData.get('cover_customer_id') === '') {
            // Nếu gửi chuỗi rỗng, xóa ảnh
            await Customer.updateOne(
                { _id: id },
                { $set: { cover_customer: null } }
            );
        }
        
        // Verify ngay sau khi update
        const verifyAfterUpdate = await Customer.findById(id).select('cover_customer').lean();
        console.log('🔍 [updateCustomerInfo] Verify ngay sau updateOne:', {
            id: verifyAfterUpdate?._id,
            cover_customer: verifyAfterUpdate?.cover_customer
        });

        // Nếu vừa chọn dịch vụ (tags) và chưa có người phụ trách thì auto-assign ngay
        try {
            if (tags && tags.length > 0) {
                const fresh = await Customer.findById(id).select('assignees tags').lean();
                if (!fresh?.assignees || fresh.assignees.length === 0) {
                    // console.log('🚩Gọi autoAssignForCustomer từ updateCustomerInfo');
                    await autoAssignForCustomer(id, { serviceId: tags[0] });
                    
                    // QUAN TRỌNG: Cập nhật lại cover_customer sau auto-assign để tránh bị ghi đè
                    if (coverCustomerId) {
                        const docAfterAssign = await Customer.findById(id);
                        if (docAfterAssign) {
                            docAfterAssign.cover_customer = coverCustomerId;
                            await docAfterAssign.save();
                            console.log('✅ Đã cập nhật lại cover_customer sau auto-assign:', coverCustomerId);
                        }
                    }
                }
            }
        } catch (e) {
            console.error('[updateCustomerInfo] Auto-assign after tag update error:', e?.message || e);
        }

        // QUAN TRỌNG: Cập nhật lại cover_customer sau auto-assign bằng updateOne
        if (coverCustomerId) {
            console.log('🔄 [updateCustomerInfo] Cập nhật lại cover_customer sau auto-assign:', coverCustomerId);
            const updateAfterAssign = await Customer.updateOne(
                { _id: id },
                { $set: { cover_customer: coverCustomerId } }
            );
            console.log('✅ [updateCustomerInfo] Kết quả update sau auto-assign:', {
                matchedCount: updateAfterAssign?.matchedCount,
                modifiedCount: updateAfterAssign?.modifiedCount,
                acknowledged: updateAfterAssign?.acknowledged
            });
        }

        // Revalidate data (sau khi đã cập nhật cover_customer)
        revalidateData();

        // QUAN TRỌNG: Cập nhật lại cover_customer sau revalidate bằng updateOne (để đảm bảo không bị cache cũ ghi đè)
        if (coverCustomerId) {
            console.log('🔄 [updateCustomerInfo] Cập nhật lại cover_customer sau revalidate:', coverCustomerId);
            const updateAfterRevalidate = await Customer.updateOne(
                { _id: id },
                { $set: { cover_customer: coverCustomerId } }
            );
            console.log('✅ [updateCustomerInfo] Kết quả update sau revalidate:', {
                matchedCount: updateAfterRevalidate?.matchedCount,
                modifiedCount: updateAfterRevalidate?.modifiedCount,
                acknowledged: updateAfterRevalidate?.acknowledged
            });
        }

        // Verify cuối cùng (đợi một chút để đảm bảo database đã cập nhật)
        await new Promise(resolve => setTimeout(resolve, 100));
        const finalVerify = await Customer.findById(id).select('cover_customer').lean();
        console.log('✅ [updateCustomerInfo] Verify cuối cùng:', {
            id: finalVerify?._id,
            cover_customer: finalVerify?.cover_customer
        });

        return { success: true, message: 'Cập nhật thông tin thành công!' };
    } catch (error) {
        console.error("Lỗi khi cập nhật khách hàng:", error);
        return { success: false, error: 'Lỗi server khi cập nhật.' };
    }
}

export async function addCareNoteAction(previousState, formData) {
    const user = await checkAuthToken();
    if (!user || !user.id) return { success: false, message: 'Bạn cần đăng nhập để thực hiện hành động này.' };
    if (!user.role.includes('Admin') && !user.role.includes('Sale') && !user.role.includes('Manager')) {
        return { success: false, message: 'Bạn không có quyền thực hiện chức năng này' };
    }

    // MỚI: Lấy thêm 'step' từ formData
    const customerId = formData.get('customerId');
    const content = formData.get('content');
    const step = formData.get('step');

    // MỚI: Thêm 'step' vào điều kiện kiểm tra
    if (!customerId || !content || !step) {
        return { success: false, error: 'Thiếu thông tin ghi chú.' };
    }

    try {
        await connectDB();

        // MỚI: Thêm trường 'step' vào object newNote
        // Chuyển step sang dạng Number để đảm bảo đúng kiểu dữ liệu trong CSDL
        const newNote = {
            content,
            step: Number(step),
            createBy: user.id,
            createAt: new Date()
        };

        await Customer.findByIdAndUpdate(customerId, {
            $push: { care: newNote }
        });

        revalidateData();
        return { success: true, message: 'Thêm ghi chú thành công.' };
    } catch (error) {
        console.error("Error adding care note:", error);
        return { success: false, error: 'Lỗi máy chủ: Không thể thêm ghi chú.' };
    }
}

export async function updateCustomerStatusAction(previousState, formData) {
    const user = await checkAuthToken();
    if (!user || !user.id) return { message: 'Bạn cần đăng nhập để thực hiện hành động này.', status: false };
    if (!user.role.includes('Admin') && !user.role.includes('Sale') && !user.role.includes('Manager')) {
        return { message: 'Bạn không có quyền thực hiện chức năng này', status: false };
    }
    const customerId = formData.get('customerId');
    const newStatusStr = formData.get('status');

    if (!customerId || !newStatusStr) {
        return { success: false, error: 'Thiếu thông tin cần thiết.' };
    }
    const newStatus = parseInt(newStatusStr, 10);
    try {
        await connectDB();
        const customer = await Customer.findById(customerId).select('status').lean();
        if (!customer) {
            return { success: false, error: 'Không tìm thấy khách hàng.' };
        }
        if (customer.status === newStatus) {
            return { success: false, error: 'Khách hàng đã ở trạng thái này.' };
        }
        await Customer.findByIdAndUpdate(customerId, {
            status: newStatus
        });
        revalidateData();
        return { success: true, message: 'Cập nhật trạng thái thành công!' };
    } catch (error) {
        console.log(error);

        return { success: false, error: 'Lỗi server khi cập nhật trạng thái.' };
    }
}

/**
 * Gán một hoặc nhiều khách hàng cho một nhân viên Sale.
 * Đồng thời cập nhật trạng thái pipeline và ghi log chăm sóc (care).
 */
export async function assignRoleToCustomersAction(prevState, formData) {
    // console.log('🚩Đi qua hàm assignRoleToCustomersAction');
    // 1. Xác thực và phân quyền người dùng
    const user = await checkAuthToken();
    if (!user || !user.id) {
        return { success: false, error: 'Bạn cần đăng nhập để thực hiện hành động này.' };
    }
    // 2. Lấy và kiểm tra dữ liệu đầu vào
    const customersJSON = formData.get('selectedCustomersJSON');
    const userIdToAssign = formData.get('userId');

    if (!userIdToAssign || !customersJSON) {
        return { success: false, error: 'Dữ liệu không hợp lệ. Vui lòng chọn người phụ trách và khách hàng.' };
    }

    let customerIds;
    try {
        customerIds = JSON.parse(customersJSON).map(c => c._id);
        if (!Array.isArray(customerIds) || customerIds.length === 0) {
            return { success: false, error: 'Không có khách hàng nào được chọn.' };
        }
    } catch (e) {
        return { success: false, error: 'Định dạng danh sách khách hàng không đúng.' };
    }

    try {
        await connectDB();

        // 3. Lấy thông tin của nhân viên được gán để xác định group
        const assignedUser = await User.findById(userIdToAssign).lean();
        if (!assignedUser) {
            return { success: false, error: 'Không tìm thấy thông tin nhân viên được gán.' };
        }

        // 4. Xác định trạng thái pipeline mới dựa trên group của nhân viên
        const userGroup = assignedUser.group; // 'noi_khoa' or 'ngoai_khoa'
        let newPipelineStatus;
        if (userGroup === 'noi_khoa') {
            newPipelineStatus = 'noikhoa_3';
        } else if (userGroup === 'ngoai_khoa') {
            newPipelineStatus = 'ngoaikhoa_3';
        } else {
            newPipelineStatus = 'undetermined_3'; // Mặc định nếu không có group
        }

        // 5. Chuẩn bị các object để cập nhật
        const assigneeObject = {
            user: new mongoose.Types.ObjectId(userIdToAssign),
            group: userGroup,
            assignedAt: new Date()
        };

        const careNote = {
            content: `Hồ sơ được phân bổ cho Sale: ${assignedUser.name || 'N/A'}`,
            createBy: new mongoose.Types.ObjectId(user.id),
            step: 3, // Ghi log cho Bước 3
            createAt: new Date()
        };

        // 6. Cập nhật hàng loạt khách hàng
        // Lấy danh sách customers để validate pipelineStatus
        const customers = await Customer.find({ _id: { $in: customerIds } }).lean();
        let updatedCount = 0;
        
        // Cập nhật từng customer để validate pipelineStatus
        for (const customer of customers) {
            const validatedStatus = validatePipelineStatusUpdate(customer, newPipelineStatus);
            const updateData = {
                $set: {
                    assignees: [assigneeObject],
                },
                $push: {
                    care: careNote,
                }
            };
            
            // Chỉ cập nhật pipelineStatus nếu step mới > step hiện tại
            if (validatedStatus) {
                updateData.$set['pipelineStatus.0'] = validatedStatus;
                updateData.$set['pipelineStatus.3'] = validatedStatus;
            }
            
            const updateResult = await Customer.updateOne(
                { _id: customer._id },
                updateData
            );
            
            if (updateResult.modifiedCount > 0) {
                updatedCount++;
            }
        }
        
        const result = { modifiedCount: updatedCount };

        revalidateData();
        if (result.modifiedCount > 0) {
            return { success: true, message: `Đã phân bổ thành công ${result.modifiedCount} khách hàng cho ${assignedUser.name}.` };
        } else {
            return { success: true, message: `Không có khách hàng nào được cập nhật. Có thể họ đã được phân bổ từ trước.` };
        }

    } catch (error) {
        console.error("Lỗi khi gán người phụ trách hàng loạt:", error);
        return { success: false, error: 'Đã xảy ra lỗi phía máy chủ. Vui lòng thử lại.' };
    }
}

/**
 * Bỏ gán một hoặc nhiều khách hàng khỏi một nhân viên Sale.
 * Đồng thời cập nhật trạng thái pipeline (nếu không còn ai phụ trách) và ghi log chăm sóc (care).
 */
export async function unassignRoleFromCustomersAction(prevState, formData) {
    // 1) Xác thực & phân quyền
    const user = await checkAuthToken();
    if (!user || !user.id) {
        return { success: false, error: 'Bạn cần đăng nhập để thực hiện hành động này.' };
    }
    // Cho phép mọi tài khoản đều có quyền sử dụng các chức năng trong Hành động
    // if (!user.role.includes('Admin') && !user.role.includes('Admin Sale')&& !user.role.includes('Manager')) {
    //     return { success: false, error: 'Bạn không có quyền thực hiện chức năng này.' };
    // }

    // 2) Dữ liệu đầu vào
    const customersJSON = formData.get('selectedCustomersJSON');
    const userIdToUnassign = formData.get('userId');

    if (!userIdToUnassign || !customersJSON) {
        return { success: false, error: 'Dữ liệu không hợp lệ. Vui lòng chọn người cần bỏ gán và khách hàng.' };
    }

    let customerIds;
    try {
        customerIds = JSON.parse(customersJSON).map((c) => c._id);
        if (!Array.isArray(customerIds) || customerIds.length === 0) {
            return { success: false, error: 'Không có khách hàng nào được chọn.' };
        }
    } catch {
        return { success: false, error: 'Định dạng danh sách khách hàng không đúng.' };
    }

    try {
        await connectDB();

        // 3) Lấy thông tin nhân viên để ghi log
        const assignedUser = await User.findById(userIdToUnassign).lean();
        if (!assignedUser) {
            return { success: false, error: 'Không tìm thấy thông tin nhân viên cần bỏ gán.' };
        }

        // 4) Care note (yêu cầu)
        const careNote = {
            content: `Hồ sơ được bỏ phân bổ cho: ${assignedUser.name || 'N/A'}`,
            createBy: new mongoose.Types.ObjectId(user.id),
            step: 3, // Ghi log cho Bước 3
            createAt: new Date()
        };

        // 5) Bỏ gán khỏi mảng assignees + ghi care
        const pullResult = await Customer.updateMany(
            { _id: { $in: customerIds } },
            {
                $pull: { assignees: { user: new mongoose.Types.ObjectId(userIdToUnassign) } },
                $push: { care: careNote }
            }
        );

        // 6) Nếu hồ sơ không còn ai phụ trách => set pipeline về trạng thái unassigned
        const UNASSIGNED_STATUS = 'unassigned_3';

        const affectedCustomers = await Customer.find(
            { _id: { $in: customerIds } },
            { _id: 1, assignees: 1 }
        ).lean();

        const idsNoAssignee = affectedCustomers
            .filter((c) => !c.assignees || c.assignees.length === 0)
            .map((c) => c._id);

        revalidateData();

        return {
            success: true,
            message: `Đã bỏ gán khỏi ${pullResult.modifiedCount} khách hàng${idsNoAssignee.length ? `; ${idsNoAssignee.length} hồ sơ không còn ai phụ trách.` : '.'}`
        };
    } catch (error) {
        console.error('Lỗi khi bỏ gán người phụ trách hàng loạt:', error);
        return { success: false, error: 'Đã xảy ra lỗi phía máy chủ. Vui lòng thử lại.' };
    }
}
