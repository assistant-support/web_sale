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
// Các import không liên quan đến Student đã được bỏ đi
// import { ProfileDefault, statusStudent } from '@/data/default'; // Không dùng cho Customer
// import { getZaloUid } from '@/function/drive/appscript'; // Không dùng cho Customer (nếu không chuyển đổi)

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
                    ],
                });
            }

            // Lọc theo nguồn
            if (currentParams.source && mongoose.Types.ObjectId.isValid(currentParams.source)) {
                filterConditions.push({ source: new mongoose.Types.ObjectId(currentParams.source) });
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

            const results = await Customer.aggregate(pipeline).exec();
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

                // Services
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

                    // Services
                    if (cloned.selectedService && sdServiceMap.has(String(cloned.selectedService))) {
                        cloned.selectedService = sdServiceMap.get(String(cloned.selectedService));
                    }
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
    revalidateTag('combined-data');
    await reloadCustomers();
}

export async function updateCustomerInfo(previousState, formData) {
    if (!formData) {
        return { success: false, error: 'Không nhận được dữ liệu từ form.' };
    }

    const id = formData.get('_id');
    if (!id) return { success: false, error: 'Thiếu ID khách hàng.' };

    try {
        await connectDB();

        // Lấy các trường cơ bản từ form
        const payload = {
            name: formData.get('name'),
            email: formData.get('email'),
            area: formData.get('area'),
            bd: formData.get('bd') ? new Date(formData.get('bd')) : null,
            // --- MỚI: Xử lý trường tags ---
            // formData.getAll() sẽ lấy tất cả giá trị có key là 'tags' thành một mảng
            tags: formData.getAll('tags'),
        };

        // Lọc ra các giá trị null hoặc undefined
        Object.keys(payload).forEach(key => {
            const value = payload[key];
            if (value === null || value === undefined || value === '') {
                delete payload[key];
            }
        });

        await Customer.findByIdAndUpdate(id, payload);

        revalidateData();
        return { success: true, message: 'Cập nhật thông tin thành công!' };
    } catch (error) {
        console.error("Lỗi khi cập nhật khách hàng:", error);
        return { success: false, error: 'Lỗi server khi cập nhật.' };
    }
}

export async function addCareNoteAction(previousState, formData) {
    const user = await checkAuthToken();
    if (!user || !user.id) return { success: false, message: 'Bạn cần đăng nhập để thực hiện hành động này.' };
    if (!user.role.includes('Admin') && !user.role.includes('Sale')) {
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
    if (!user.role.includes('Admin') && !user.role.includes('Sale')) {
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
    // 1. Xác thực và phân quyền người dùng
    const user = await checkAuthToken();
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
        const result = await Customer.updateMany(
            { _id: { $in: customerIds } },
            {
                // Thêm nhân viên vào danh sách phụ trách (tránh trùng lặp)
                $addToSet: { assignees: assigneeObject },
                // Ghi log hành động
                $push: { care: careNote },
                // Cập nhật trạng thái pipeline
                $set: {
                    'pipelineStatus.0': newPipelineStatus, // Trạng thái tổng quan gần nhất
                    'pipelineStatus.3': newPipelineStatus, // Trạng thái cho Bước 3: Phân bổ
                }
            }
        );

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
    if (!user.role.includes('Admin') && !user.role.includes('Admin Sale')) {
        return { success: false, error: 'Bạn không có quyền thực hiện chức năng này.' };
    }

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
