'use server';
import { unstable_cache as nextCache, revalidateTag } from 'next/cache';
import connectDB from "@/config/connectDB";
import Customer from "@/models/customer";
import mongoose from 'mongoose';
import checkAuthToken from '@/utils/checktoken';
import User from '@/models/users';
import '@/models/zalo' // Giữ lại nếu Zalo Account vẫn liên quan đến Customer
import ScheduledJob from "@/models/schedule";
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
            let pipeline = [];
            let shouldPopulate = true; // Luôn là true vì chỉ làm việc với Customer

            // Luôn sử dụng Customer model
            const filterConditions = [];
            filterConditions.push({ 'status': { $ne: 1 } }); // Giữ lại logic này nếu 'status: 1' là trạng thái đã chuyển đổi
            if (query) {
                filterConditions.push({ $or: [{ name: { $regex: query, $options: 'i' } }, { phone: { $regex: query, $options: 'i' } }, { nameparent: { $regex: query, $options: 'i' } }] });
            }
            if (currentParams.source) {
                if (currentParams.source === 'null') {
                    filterConditions.push({ $or: [{ source: null }, { source: { $exists: false } }] });
                } else if (mongoose.Types.ObjectId.isValid(currentParams.source)) {
                    filterConditions.push({ source: new mongoose.Types.ObjectId(currentParams.source) });
                }
            }
            if (currentParams.area) {
                filterConditions.push({ area: currentParams.area });
            }
            if (currentParams.careStatus) {
                filterConditions.push({ status: parseInt(currentParams.careStatus, 10) });
            }
            const zaloAccountFilter = mongoose.Types.ObjectId.isValid(currentParams.zaloAccount)
                ? new mongoose.Types.ObjectId(currentParams.zaloAccount)
                : null;

            // Áp dụng logic lọc mới cho uidStatus
            if (currentParams.uidStatus === 'not_searched') {
                if (zaloAccountFilter) {
                    filterConditions.push({
                        $nor: [
                            { uid: { $elemMatch: { zalo: zaloAccountFilter } } },
                            { uid: null }
                        ]
                    });
                }
                else {
                    // "Chưa tìm" chung: uid là mảng rỗng hoặc không tồn tại.
                    filterConditions.push({ $or: [{ uid: { $exists: false } }, { uid: [] }] });
                }
            } else if (currentParams.uidStatus === 'not_found') {
                // "Không tìm thấy": chỉ những người có trường uid bị set thành null. Không phụ thuộc Zalo.
                filterConditions.push({ uid: null });
            } else if (currentParams.uidStatus === 'true') {
                if (zaloAccountFilter) {
                    filterConditions.push({
                        uid: { $elemMatch: { zalo: zaloAccountFilter, uid: { $exists: true, $ne: null } } }
                    });
                } else {
                    filterConditions.push({
                        'uid.uid': { $exists: true, $ne: null }
                    });
                }
            }
            if (currentParams.label && mongoose.Types.ObjectId.isValid(currentParams.label)) {
                filterConditions.push({ labels: new mongoose.Types.ObjectId(currentParams.label) });
            }
            if (currentParams.user && mongoose.Types.ObjectId.isValid(currentParams.user)) {
                filterConditions.push({ roles: new mongoose.Types.ObjectId(currentParams.user) });
            }
            const matchStage = filterConditions.length > 0 ? { $match: { $and: filterConditions } } : { $match: {} };
            pipeline = [
                matchStage,
                { $addFields: { type: false } }, // Luôn là false cho Customer
                { $lookup: { from: 'forms', localField: 'source', foreignField: '_id', as: 'sourceInfo' } },
                { $unwind: { path: '$sourceInfo', preserveNullAndEmptyArrays: true } },
                { $addFields: { source: '$sourceInfo.name' } },
                { $project: { sourceInfo: 0 } }
            ];

            const commonStages = [
                { $sort: { createAt: -1, _id: -1 } },
                { $facet: { paginatedResults: [{ $skip: skip }, { $limit: limit }], totalCount: [{ $count: 'count' }] } }
            ];
            pipeline.push(...commonStages);

            const results = await Customer.aggregate(pipeline).exec(); // Luôn aggregate trên Customer
            let paginatedData = results[0]?.paginatedResults || [];

            if (shouldPopulate && paginatedData.length > 0) {
                const userIds = new Set();
                paginatedData.forEach(customer => {
                    // Populate cho `care.createBy`
                    customer.care?.forEach(note => { if (note.createBy) userIds.add(note.createBy.toString()); });
                    // Populate cho `roles`
                    customer.roles?.forEach(roleId => userIds.add(roleId.toString()));
                });

                if (userIds.size > 0) {
                    const users = await User.find({ _id: { $in: Array.from(userIds) } }).select('name avt').lean();
                    const userMap = new Map(users.map(u => [u._id.toString(), u]));

                    paginatedData.forEach(customer => {
                        // Gán thông tin user cho `care.createBy`
                        customer.care?.forEach(note => {
                            if (note.createBy && userMap.has(note.createBy.toString())) {
                                note.createBy = userMap.get(note.createBy.toString());
                            }
                        });
                        // Thay thế mảng `roles` từ ID thành object user đầy đủ
                        if (customer.roles) {
                            customer.roles = customer.roles.map(roleId => userMap.get(roleId.toString())).filter(Boolean);
                        }
                    });
                }
            }

            const phoneNumbers = paginatedData.map(p => p.phone).filter(Boolean);
            if (phoneNumbers.length > 0) {
                const scheduledTasksRaw = await ScheduledJob.aggregate([
                    { $match: { $expr: { $lt: [{ $add: ["$statistics.completed", "$statistics.failed"] }, "$statistics.total"] } } },
                    { $unwind: "$tasks" },
                    { $match: { 'tasks.processedAt': { $exists: false }, 'tasks.person.phone': { $in: phoneNumbers } } },
                    { $sort: { 'tasks.scheduledFor': 1 } },
                    { $group: { _id: "$tasks.person.phone", job: { $first: "$$ROOT" } } },
                    { $lookup: { from: 'zaloaccounts', localField: 'job.zaloAccount', foreignField: '_id', as: 'zaloAccountInfo' } },
                    { $lookup: { from: 'users', localField: 'job.createdBy', foreignField: '_id', as: 'creatorInfo' } },
                    { $unwind: { path: '$zaloAccountInfo', preserveNullAndEmptyArrays: true } },
                    { $unwind: { path: '$creatorInfo', preserveNullAndEmptyArrays: true } },
                    { $project: { _id: 1, statusaction: { jobName: '$job.jobName', actionType: '$job.actionType', zaloAccount: { _id: '$job.zaloAccount', name: '$zaloAccountInfo.name', avt: '$zaloAccountInfo.avt' }, createdBy: { _id: '$job.createdBy', name: '$creatorInfo.name', avt: '$creatorInfo.avt' } } } }
                ]);
                const scheduleMap = new Map(scheduledTasksRaw.map(item => [item._id, item.statusaction]));
                paginatedData.forEach(person => { person.statusaction = scheduleMap.get(person.phone) || null; });
            } else {
                paginatedData.forEach(person => { person.statusaction = null; });
            }

            if (currentParams.campaignStatus) {
                paginatedData = paginatedData.filter(p => currentParams.campaignStatus === 'true' ? p.statusaction !== null : p.statusaction === null);
            }

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
}

export async function updateCustomerInfo(previousState, formData) {
    const id = formData.get('_id');
    // const isStudent = formData.get('type') === 'true'; // Loại bỏ check này vì luôn là Customer
    if (!id) return { success: false, error: 'Thiếu ID.' };
    try {
        await connectDB();
        const payload = {
            name: formData.get('name'),
            phone: formData.get('phone'),
            email: formData.get('email'),
            nameparent: formData.get('nameparent'),
            bd: formData.get('bd') ? new Date(formData.get('bd')) : null,
        };
        // Chỉ cập nhật Customer
        await Customer.findByIdAndUpdate(id, payload);

        revalidateData();
        return { success: true };
    } catch (error) {
        return { success: false, error: 'Lỗi server khi cập nhật.' };
    }
}

export async function addCareNoteAction(previousState, formData) {
    const user = await checkAuthToken();
    if (!user || !user.id) return { message: 'Bạn cần đăng nhập để thực hiện hành động này.', status: false };
    if (!user.role.includes('Admin') && !user.role.includes('Sale')) {
        return { message: 'Bạn không có quyền thực hiện chức năng này', status: false };
    }
    const customerId = formData.get('customerId');
    const content = formData.get('content');
    if (!customerId || !content) return { success: false, error: 'Thiếu thông tin.' };
    try {
        await connectDB();
        const newNote = { content, createBy: user.id, createAt: new Date() };
        await Customer.findByIdAndUpdate(customerId, {
            $push: { care: newNote }
        });
        revalidateData();
        return { success: true };
    } catch (error) {
        return { success: false, error: 'Không thể thêm ghi chú.' };
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

// Hàm convertToStudentAction đã bị loại bỏ hoàn toàn.
// export async function convertToStudentAction(previousState, formData) { ... }


export async function assignRoleToCustomersAction(prevState, formData) {
    const user = await checkAuthToken();
    if (!user || !user.id) return { message: 'Bạn cần đăng nhập để thực hiện hành động này.', status: false };
    if (!user.role.includes('Admin') && !user.role.includes('Sale')) {
        return { message: 'Bạn không có quyền thực hiện chức năng này', status: false };
    }
    const customersJSON = formData.get('selectedCustomersJSON');
    const userId = formData.get('userId');

    // --- Validation ---
    if (!userId || !customersJSON) {
        return { success: false, error: 'Dữ liệu không hợp lệ. Vui lòng chọn người phụ trách và danh sách khách hàng.' };
    }

    let customerIds;
    try {
        customerIds = JSON.parse(customersJSON).map(c => c._id);
        if (!Array.isArray(customerIds) || customerIds.length === 0) {
            return { success: false, error: 'Không có khách hàng nào được chọn.' };
        }
    } catch (e) {
        console.error("Lỗi parsing JSON khách hàng:", e);
        return { success: false, error: 'Định dạng danh sách khách hàng không đúng.' };
    }

    try {
        await connectDB();
        const result = await Customer.updateMany(
            { _id: { $in: customerIds } },
            { $addToSet: { roles: new mongoose.Types.ObjectId(userId) } }
        );

        if (result.modifiedCount === 0 && result.matchedCount > 0) {
            return { success: true, message: `Các khách hàng này đã được gán cho người dùng được chọn từ trước. Không có gì thay đổi.` };
        }
        revalidateData();
        return { success: true, message: `Đã gán thành công ${result.modifiedCount} khách hàng.` };

    } catch (error) {
        console.error("Lỗi gán người phụ trách hàng loạt:", error);
        return { success: false, error: 'Đã xảy ra lỗi phía máy chủ. Vui lòng thử lại.' };
    }
}