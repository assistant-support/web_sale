export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import ScheduledJob from "@/models/schedule";
import ZaloAccount from "@/models/zalo.model";
import Customer from "@/models/customer.model";
import Variant from "@/models/variant.model";
import Logs from "@/models/log.model";
import dbConnect from "@/config/connectDB";
import { ZaloAccount as ZaloAccountNew } from '@/models/zalo-account.model';
import { sendUserMessage } from '@/data/zalo/chat.actions';

export async function formatMessage(template, targetDoc, zaloAccountDoc) {
    if (!template) return "";
    let message = template;

    message = message.replace(/{name}/g, targetDoc.name || "");
    message = message.replace(/{nameparent}/g, targetDoc.nameparent || "");
    message = message.replace(/{namezalo}/g, targetDoc.zaloname || "");

    const variantPlaceholders = message.match(/{[^{}]+}/g) || [];
    for (const placeholder of variantPlaceholders) {
        const variantName = placeholder.slice(1, -1);
        const variant = await Variant.findOne({ name: variantName }).lean();
        if (variant && variant.phrases && variant.phrases.length > 0) {
            const randomPhrase = variant.phrases[Math.floor(Math.random() * variant.phrases.length)];
            message = message.replace(placeholder, randomPhrase);
        }
    }
    console.log(message);

    return message;
}

async function processSingleTask(taskDetail) {
    const { task, job, zaloAccount } = taskDetail;

    try {
        // Luôn làm việc với model Customer
        const TargetModel = Customer;
        const targetId = task.person._id;

        const targetDoc = await TargetModel.findById(targetId).lean();

        if (!targetDoc) {
            throw new Error(`Target document not found in Customer with _id: ${targetId}`);
        }

        let apiResponse;
        let errorMessageForLog = null;
        const actionType = job.actionType;
        let uidPerson = null;

        // Logic tìm uidPerson: chỉ cần có UID là được, không cần kiểm tra UID thuộc về tài khoản Zalo nào
        if (actionType === 'addFriend' || actionType === 'sendMessage' || actionType === 'checkFriend') {
            // Tìm UID đầu tiên có sẵn (bất kỳ UID nào)
            const uidEntry = targetDoc.uid?.find(u => u && u.uid && String(u.uid).trim().length > 0);
            if (!uidEntry || !uidEntry.uid) {
                errorMessageForLog = "Không tìm thấy UID của khách hàng.";
                apiResponse = { status: false, message: errorMessageForLog, content: { error_code: -1, error_message: errorMessageForLog, data: {} } };
            } else {
                uidPerson = uidEntry.uid;
            }
        }

        let finalMessage = "";
        if (!errorMessageForLog) {
            finalMessage = await formatMessage(job.config.messageTemplate, targetDoc, zaloAccount);
            
            // Chỉ xử lý sendMessage bằng zca-js, các actionType khác vẫn dùng actionZalo
            if (actionType === 'sendMessage') {
                // Lấy accountKey từ zaloAccount đã được format trong scheduler
                let accountKey = null;
                try {
                    // Nếu zaloAccount đã có accountKey (từ ZaloAccount mới)
                    if (zaloAccount.accountKey) {
                        accountKey = zaloAccount.accountKey;
                    } else if (zaloAccount.uid) {
                        // Nếu là ZaloAccount cũ, tìm trong ZaloAccount mới
                        const zaloAccountNew = await ZaloAccountNew.findOne({
                            $or: [
                                { 'profile.zaloId': String(zaloAccount.uid).trim() },
                                { accountKey: String(zaloAccount.uid).trim() }
                            ],
                            status: 'active'
                        }).sort({ updatedAt: 1 }).lean();
                        
                        if (zaloAccountNew?.accountKey) {
                            accountKey = zaloAccountNew.accountKey;
                        }
                    }
                    
                    // Fallback: lấy account đầu tiên có status active nếu vẫn chưa có
                    if (!accountKey) {
                        const fallbackAccount = await ZaloAccountNew.findOne({ 
                            status: 'active' 
                        }).sort({ updatedAt: 1 }).lean();
                        if (fallbackAccount?.accountKey) {
                            accountKey = fallbackAccount.accountKey;
                        }
                    }
                } catch (err) {
                    console.error('[processSingleTask] Lỗi khi tìm accountKey:', err);
                }
                
                if (!accountKey) {
                    errorMessageForLog = 'Không tìm thấy tài khoản Zalo hợp lệ. Vui lòng đăng nhập QR trước.';
                    apiResponse = { status: false, message: errorMessageForLog, content: { error_code: -1, error_message: errorMessageForLog, data: {} } };
                } else {
                    try {
                        const result = await sendUserMessage({
                            accountKey: accountKey,
                            userId: uidPerson,
                            text: finalMessage,
                            attachments: []
                        });
                        
                        // Format result để tương thích với code cũ
                        apiResponse = {
                            status: result.ok || false,
                            message: result.ok ? 'Gửi tin nhắn thành công' : (result.message || 'Gửi tin nhắn thất bại'),
                            content: {
                                error_code: result.ok ? 0 : -1,
                                error_message: result.ok ? '' : (result.message || 'Gửi tin nhắn thất bại'),
                                data: result.ack || {}
                            }
                        };
                    } catch (err) {
                        console.error('[processSingleTask] Lỗi khi gửi tin nhắn:', err);
                        apiResponse = {
                            status: false,
                            message: err?.message || 'Lỗi không xác định',
                            content: {
                                error_code: -1,
                                error_message: err?.message || 'Lỗi không xác định',
                                data: {}
                            }
                        };
                    }
                }
            } else if (actionType === 'checkFriend') {
                // Sử dụng getFriendRequestStatus từ zca-js
                try {
                    const { getFriendRequestStatus } = await import('@/data/zalo/chat.actions');
                    const result = await getFriendRequestStatus({
                        accountKey: zaloAccount.accountKey || zaloAccount.uid,
                        friendId: uidPerson
                    });
                    
                    // Format response để tương thích với code cũ
                    const isFriend = result.ok && result.is_friend === 1 ? 1 : 0;
                    
                    apiResponse = {
                        status: result.ok,
                        message: result.ok ? 'Kiểm tra bạn bè thành công' : (result.message || 'Kiểm tra bạn bè thất bại'),
                        content: {
                            error_code: result.ok ? 0 : -1,
                            error_message: result.ok ? String(isFriend) : (result.message || 'Kiểm tra bạn bè thất bại'),
                            data: { isFriend },
                            isFriend
                        }
                    };
                } catch (err) {
                    console.error('[processSingleTask] Lỗi khi kiểm tra bạn bè:', err);
                    apiResponse = {
                        status: false,
                        message: err?.message || 'Lỗi không xác định',
                        content: {
                            error_code: -1,
                            error_message: err?.message || 'Lỗi không xác định',
                            data: { isFriend: 0 }
                        }
                    };
                }
            } else if (actionType === 'addFriend') {
                // Sử dụng sendFriendRequest từ zca-js
                try {
                    const { sendFriendRequest } = await import('@/data/zalo/chat.actions');
                    const result = await sendFriendRequest({
                        accountKey: zaloAccount.accountKey || zaloAccount.uid,
                        userId: uidPerson,
                        msg: finalMessage || 'Xin chào, hãy kết bạn với tôi!'
                    });
                    
                    // Format response để tương thích với code cũ
                    apiResponse = {
                        status: result.ok,
                        message: result.ok ? 'Gửi lời mời kết bạn thành công' : (result.message || 'Gửi lời mời kết bạn thất bại'),
                        content: {
                            error_code: result.ok ? 0 : -1,
                            error_message: result.ok ? '' : (result.message || 'Gửi lời mời kết bạn thất bại'),
                            data: result.result || {}
                        }
                    };
                } catch (err) {
                    console.error('[processSingleTask] Lỗi khi gửi lời mời kết bạn:', err);
                    apiResponse = {
                        status: false,
                        message: err?.message || 'Lỗi không xác định',
                        content: {
                            error_code: -1,
                            error_message: err?.message || 'Lỗi không xác định',
                            data: {}
                        }
                    };
                }
            } else {
                // Các actionType khác vẫn dùng actionZalo (nếu còn)
                const { actionZalo } = await import('@/function/drive/appscript');
                apiResponse = await actionZalo({
                    phone: targetDoc.phone,
                    uidPerson: uidPerson,
                    actionType: actionType,
                    message: finalMessage,
                    uid: zaloAccount.uid,
                });
            }
        }

        const logPayload = {
            message: finalMessage || errorMessageForLog,
            status: {
                status: apiResponse.status,
                message: apiResponse.message,
                data: {
                    error_code: apiResponse.content?.error_code,
                    error_message: apiResponse.content?.error_message,
                }
            },
            type: actionType,
            createBy: job.createdBy,
            customer: targetId, // Chỉ sử dụng trường customer
            zalo: job.zaloAccount,
            schedule: job._id,
        };
        const newLog = await Logs.create(logPayload);
        const errorCode = apiResponse.content?.error_code;

        if (actionType === 'findUid') {
            if (errorCode === 0) {
                const updateData = {
                    zaloavt: apiResponse.content.data.avatar,
                    zaloname: apiResponse.content.data.zalo_name,
                };
                await TargetModel.findByIdAndUpdate(targetId, { $set: updateData });

                const newUidValue = apiResponse.content.data.uid;
                const updateResult = await TargetModel.updateOne(
                    { _id: targetId, 'uid.zalo': zaloAccount._id },
                    { $set: { 'uid.$.uid': newUidValue } }
                );
                if (updateResult.matchedCount === 0) {
                    await TargetModel.findByIdAndUpdate(
                        targetId,
                        { $push: { uid: { zalo: zaloAccount._id, uid: newUidValue } } }
                    );
                }
            } else if ([216, 212, 219].includes(errorCode)) {
                await TargetModel.findByIdAndUpdate(targetId, { $set: { uid: null } });
            }
        }
        if (actionType === 'checkFriend') {
            // Lấy isFriend từ response.content.isFriend hoặc response.content.data.isFriend hoặc response.content.error_message
            const friendStatus = apiResponse.content?.isFriend ?? 
                                 apiResponse.content?.data?.isFriend ?? 
                                 Number(apiResponse.content?.error_message);
            if (!isNaN(friendStatus) && (friendStatus === 0 || friendStatus === 1)) {
                await TargetModel.updateOne(
                    { _id: targetId },
                    { $set: { "uid.$[elem].isFriend": friendStatus } },
                    { arrayFilters: [{ "elem.zalo": zaloAccount._id }] }
                );
            }
        }
        if (actionType === 'addFriend' && apiResponse.status === true) {
            await TargetModel.updateOne(
                { _id: targetId },
                { $set: { "uid.$[elem].isReques": 1 } },
                { arrayFilters: [{ "elem.zalo": zaloAccount._id }] }
            );
        }

        await ScheduledJob.updateOne(
            { _id: job._id, 'tasks._id': task._id },
            { $set: { 'tasks.$.history': newLog._id } }
        );

        const statsUpdateField = apiResponse.status ? 'statistics.completed' : 'statistics.failed';
        const updatedJob = await ScheduledJob.findByIdAndUpdate(
            job._id,
            { $inc: { [statsUpdateField]: 1 } },
            { new: true }
        ).lean();

        if (updatedJob) {
            const { completed, failed, total } = updatedJob.statistics;
            if ((completed + failed) >= total) {
                await ZaloAccount.findByIdAndUpdate(
                    job.zaloAccount,
                    { $pull: { action: job._id } }
                );
            }
        }
    } catch (error) {
        console.error(`[Scheduler] Error processing task ${task._id} from job ${job._id}:`, error);
        await ScheduledJob.findByIdAndUpdate(job._id, { $inc: { 'statistics.failed': 1 } });
    }
}

/**
 * Hàm xử lý các task đến hạn (có thể gọi trực tiếp hoặc qua HTTP)
 */
export async function processScheduledTasks() {
    try {
        await dbConnect();
        const now = new Date();
        const oneMinuteLater = new Date(now.getTime() + 60 * 1000);
        
        // Tìm các task đến hạn
        const dueTasksDetails = await ScheduledJob.aggregate([
            { $match: { 'tasks.status': false, 'tasks.scheduledFor': { $lte: oneMinuteLater } } },
            { $unwind: '$tasks' },
            { $match: { 'tasks.status': false, 'tasks.scheduledFor': { $lte: oneMinuteLater } } },
            {
                $lookup: {
                    from: 'zaloaccounts',
                    localField: 'zaloAccount',
                    foreignField: '_id',
                    as: 'zaloAccountInfoNew'
                }
            },
            {
                $lookup: {
                    from: 'zalos',
                    localField: 'zaloAccount',
                    foreignField: '_id',
                    as: 'zaloAccountInfoOld'
                }
            },
            { 
                $match: { 
                    $or: [
                        { 'zaloAccountInfoNew': { $ne: [] } },
                        { 'zaloAccountInfoOld': { $ne: [] } }
                    ]
                } 
            },
            { $sort: { 'tasks.scheduledFor': 1 } },
            {
                $project: {
                    _id: 0,
                    job: { _id: '$_id', jobName: '$jobName', actionType: '$actionType', zaloAccount: '$zaloAccount', config: '$config', createdBy: '$createdBy' },
                    task: '$tasks',
                    zaloAccountNew: { $arrayElemAt: ['$zaloAccountInfoNew', 0] },
                    zaloAccountOld: { $arrayElemAt: ['$zaloAccountInfoOld', 0] }
                }
            }
        ]);
        
        // Format zaloAccount để tương thích với processSingleTask
        const formattedTasks = dueTasksDetails.map(detail => {
            let zaloAccount = null;
            if (detail.zaloAccountNew) {
                // Format ZaloAccount mới
                zaloAccount = {
                    _id: detail.zaloAccountNew._id,
                    uid: detail.zaloAccountNew.accountKey,
                    name: detail.zaloAccountNew.profile?.displayName || 'Zalo Account',
                    accountKey: detail.zaloAccountNew.accountKey
                };
            } else if (detail.zaloAccountOld) {
                // Format ZaloAccount cũ
                zaloAccount = detail.zaloAccountOld;
            }
            return {
                ...detail,
                zaloAccount
            };
        }).filter(detail => detail.zaloAccount !== null);

        if (formattedTasks.length === 0) {
            return {
                success: true,
                message: 'No due tasks to process.',
                count: 0
            };
        }

        const taskUpdateOperations = formattedTasks.map(detail => ({
            updateOne: {
                filter: { _id: detail.job._id, 'tasks._id': detail.task._id },
                update: { $set: { 'tasks.$.status': true } }
            }
        }));
        await ScheduledJob.bulkWrite(taskUpdateOperations);

        // Xử lý các task trong background
        for (const taskDetail of formattedTasks) {
            processSingleTask(taskDetail).catch(err => {
                console.error('[Scheduler] Lỗi khi xử lý task:', err);
            });
        }

        return {
            success: true,
            message: `Scheduler triggered. Processing ${formattedTasks.length} tasks in the background.`,
            count: formattedTasks.length
        };

    } catch (error) {
        console.error('[Scheduler Error]', error);
        return {
            success: false,
            message: 'Internal Server Error',
            error: error.message
        };
    }
}

/**
 * HTTP endpoint để gọi scheduler (cho testing hoặc manual trigger)
 */
export async function GET(request) {
    const result = await processScheduledTasks();
    
    if (result.success) {
        return NextResponse.json({
            message: result.message,
            count: result.count
        }, { status: result.count > 0 ? 202 : 200 });
    } else {
        return NextResponse.json(
            { message: result.message, error: result.error },
            { status: 500 }
        );
    }
}