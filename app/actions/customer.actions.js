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

            if (query) {
                filterConditions.push({ $or: [{ name: { $regex: query, $options: 'i' } }, { phone: { $regex: query, $options: 'i' } }] });
            }
            if (currentParams.source && mongoose.Types.ObjectId.isValid(currentParams.source)) {
                filterConditions.push({ source: new mongoose.Types.ObjectId(currentParams.source) });
            }
            if (currentParams.pipelineStatus) {
                filterConditions.push({ pipelineStatus: currentParams.pipelineStatus });
            }
            if (currentParams.tags) {
                if (currentParams.tags === 'null') {
                    filterConditions.push({ $or: [{ tags: { $exists: false } }, { tags: null }, { tags: { $size: 0 } }] });
                } else {
                    const tagsAsObjectIds = currentParams.tags.split(',')
                        .map(id => id.trim())
                        .filter(id => mongoose.Types.ObjectId.isValid(id))
                        .map(id => new mongoose.Types.ObjectId(id));
                    if (tagsAsObjectIds.length > 0) {
                        filterConditions.push({ tags: { $in: tagsAsObjectIds } });
                    }
                }
            }

            // THAY ĐỔI 1: Sửa logic lọc để tìm trong mảng 'assignees'
            if (currentParams.assignee && mongoose.Types.ObjectId.isValid(currentParams.assignee)) {
                // Tìm các document có 'assignees.user' chứa _id người dùng được chỉ định
                filterConditions.push({ 'assignees.user': new mongoose.Types.ObjectId(currentParams.assignee) });
            }

            if (currentParams.zaloPhase) {
                filterConditions.push({ zaloPhase: currentParams.zaloPhase });
            }
            if (currentParams.startDate && currentParams.endDate) {
                const startDate = new Date(currentParams.startDate);
                startDate.setHours(0, 0, 0, 0);
                const endDate = new Date(currentParams.endDate);
                endDate.setHours(23, 59, 59, 999);
                filterConditions.push({ createAt: { $gte: startDate, $lte: endDate } });
            }

            const matchStage = filterConditions.length > 0 ? { $match: { $and: filterConditions } } : { $match: {} };

            // THAY ĐỔI 2: Đơn giản hóa pipeline, loại bỏ lookup cho 'assignee' (sẽ populate bằng code JS)
            let pipeline = [
                matchStage,
                { $lookup: { from: 'forms', localField: 'source', foreignField: '_id', as: 'sourceInfo' } },
                { $unwind: { path: '$sourceInfo', preserveNullAndEmptyArrays: true } },
                {
                    $addFields: {
                        sourceName: '$sourceInfo.name',
                        lastCareNote: { $last: '$care' }
                    }
                },
                { $lookup: { from: 'services', localField: 'tags', foreignField: '_id', as: 'tags' } },
                { $project: { sourceInfo: 0 } } // Chỉ cần loại bỏ sourceInfo
            ];

            const commonStages = [
                { $sort: { createAt: -1 } },
                { $facet: { paginatedResults: [{ $skip: skip }, { $limit: limit }], totalCount: [{ $count: 'count' }] } }
            ];
            pipeline.push(...commonStages);

            const results = await Customer.aggregate(pipeline).exec();
            let paginatedData = results[0]?.paginatedResults || [];

            if (paginatedData.length > 0) {
                const userIds = new Set();
                paginatedData.forEach(customer => {
                    // Thu thập userId từ 'care'
                    customer.care?.forEach(note => { if (note.createBy) userIds.add(note.createBy.toString()); });

                    // THAY ĐỔI 3: Thu thập userId từ mảng 'assignees'
                    customer.assignees?.forEach(assignment => { if (assignment.user) userIds.add(assignment.user.toString()); });
                });

                if (userIds.size > 0) {
                    const users = await User.find({ _id: { $in: Array.from(userIds) } }).select('name avt').lean();
                    const userMap = new Map(users.map(u => [u._id.toString(), u]));

                    paginatedData.forEach(customer => {
                        // Gắn thông tin user vào 'care'
                        customer.care?.forEach(note => {
                            if (note.createBy && userMap.has(note.createBy.toString())) {
                                note.createBy = userMap.get(note.createBy.toString());
                            }
                        });
                        if (customer.lastCareNote?.createBy && userMap.has(customer.lastCareNote.createBy.toString())) {
                            customer.lastCareNote.createBy = userMap.get(customer.lastCareNote.createBy.toString());
                        }

                        // THAY ĐỔI 4: Gắn thông tin user vào mảng 'assignees'
                        customer.assignees?.forEach(assignment => {
                            if (assignment.user && userMap.has(assignment.user.toString())) {
                                assignment.user = userMap.get(assignment.user.toString());
                            }
                        });
                    });
                }
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
    if (!user || !user.id) return { success: false, error: 'Bạn cần đăng nhập để thực hiện hành động này.' };
    if (!user.role.includes('Admin') && !user.role.includes('Admin Sale')) {
        return { success: false, error: 'Bạn không có quyền thực hiện chức năng này.' };
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
