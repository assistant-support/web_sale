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

// Chuẩn hóa UID Zalo (loại bỏ ký tự không phải số)
function normalizeUid(u) {
    return String(u ?? "").trim().replace(/\D/g, "");
}

/** Lấy accountKey dùng cho cả tìm UID và gửi tin (tránh gọi ensureZaloApi nhiều lần / lỗi cookie) */
async function getAccountKeyForTask(zaloAccount) {
    if (!zaloAccount) return null;
    if (zaloAccount.accountKey) return String(zaloAccount.accountKey).trim();
    const uidOrId = zaloAccount.uid || zaloAccount._id;
    if (!uidOrId) return null;
    const str = String(uidOrId).trim();
    const acc = await ZaloAccountNew.findOne({
        $or: [
            { accountKey: str },
            { 'profile.zaloId': str },
            { _id: zaloAccount._id }
        ],
        status: 'active'
    }).sort({ updatedAt: 1 }).select('accountKey').lean();
    return acc?.accountKey ? String(acc.accountKey).trim() : null;
}

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

const RETRY_DELAY_RATE_MS = 5 * 60 * 1000;   // 5 phút khi rate limit
const RETRY_DELAY_SESSION_MS = 15 * 60 * 1000; // 15 phút khi lỗi session/cookie
const SLEEP_AFTER_TASK_MS = 3000;             // 3 giây giữa các lần gửi (theo tài liệu)

async function processSingleTask(taskDetail) {
    const { task, job, zaloAccount } = taskDetail;
    let needRetry = false;
    let retryDelayMs = 0;

    try {
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

        // Resolve accountKey một lần cho cả tìm UID và gửi tin (tránh lỗi cookie/session do gọi nhiều lần)
        let accountKeyForTask = null;
        if (actionType === 'addFriend' || actionType === 'sendMessage' || actionType === 'checkFriend') {
            accountKeyForTask = await getAccountKeyForTask(zaloAccount);
        }

        // Logic tìm uidPerson: ưu tiên UID trong DB, chưa có thì tìm qua zca-js rồi lưu
        if (actionType === 'addFriend' || actionType === 'sendMessage' || actionType === 'checkFriend') {
            const uidEntry = targetDoc.uid?.find(u => u && u.uid && String(u.uid).trim().length > 0);
            if (uidEntry && uidEntry.uid) {
                uidPerson = uidEntry.uid;
            } else {
                // Chưa có UID → tìm UID qua zca-js
                try {
                    if (!accountKeyForTask) {
                        errorMessageForLog = "Không tìm thấy tài khoản Zalo hợp lệ để tìm UID.";
                        apiResponse = {
                            status: false,
                            message: errorMessageForLog,
                            content: { error_code: -1, error_message: errorMessageForLog, data: {} }
                        };
                    } else if (!targetDoc.phone) {
                        errorMessageForLog = "Khách hàng không có số điện thoại để tìm UID.";
                        apiResponse = {
                            status: false,
                            message: errorMessageForLog,
                            content: { error_code: -1, error_message: errorMessageForLog, data: {} }
                        };
                    } else {
                        const { findUserUid } = await import('@/data/zalo/chat.actions');
                        const formattedPhone = targetDoc.phone.toString().trim().replace(/\D/g, '');

                        const findUidResult = await findUserUid({
                            accountKey: accountKeyForTask,
                            phoneOrUid: formattedPhone
                        });

                        if (findUidResult.code === 'rate_limited') {
                            needRetry = true;
                            retryDelayMs = RETRY_DELAY_RATE_MS;
                            errorMessageForLog = findUidResult.message || 'Rate limit Zalo, thử lại sau.';
                            apiResponse = { status: false, message: errorMessageForLog, content: { error_code: -1, error_message: errorMessageForLog, data: {} } };
                        } else if (findUidResult.code === 'bootstrap_failed' || findUidResult.code === 'unauthorized') {
                            needRetry = true;
                            retryDelayMs = RETRY_DELAY_SESSION_MS;
                            errorMessageForLog = findUidResult.message || 'Lỗi phiên Zalo (cookie/session), thử lại sau hoặc đăng nhập lại QR.';
                            apiResponse = { status: false, message: errorMessageForLog, content: { error_code: -1, error_message: errorMessageForLog, data: {} } };
                        } else if (findUidResult.ok && findUidResult.uid) {
                            const normalizedUid = normalizeUid(findUidResult.uid);
                            if (normalizedUid) {
                                // Lưu UID vào Customer để dùng cho các lần sau
                                await Customer.updateOne(
                                    { _id: targetId },
                                    {
                                        $set: {
                                            zaloavt: findUidResult.avatar || targetDoc.zaloavt || null,
                                            zaloname: findUidResult.displayName || targetDoc.zaloname || null
                                        },
                                        $push: {
                                            uid: {
                                                zalo: zaloAccount._id,
                                                uid: normalizedUid,
                                                isFriend: 0,
                                                isReques: 0
                                            }
                                        }
                                    }
                                );

                                uidPerson = normalizedUid;
                            } else {
                                errorMessageForLog = "UID tìm được rỗng sau khi chuẩn hóa.";
                                apiResponse = {
                                    status: false,
                                    message: errorMessageForLog,
                                    content: { error_code: -1, error_message: errorMessageForLog, data: {} }
                                };
                            }
                        } else {
                            errorMessageForLog = findUidResult.message || "Không tìm thấy UID Zalo của khách hàng khi thực hiện hành động.";
                            apiResponse = {
                                status: false,
                                message: errorMessageForLog,
                                content: { error_code: -1, error_message: errorMessageForLog, data: {} }
                            };
                        }
                    }
                } catch (err) {
                    console.error('[processSingleTask] Lỗi khi tự động tìm UID cho khách hàng:', err);
                    errorMessageForLog = err?.message || "Lỗi khi tự động tìm UID cho khách hàng.";
                    apiResponse = {
                        status: false,
                        message: errorMessageForLog,
                        content: { error_code: -1, error_message: errorMessageForLog, data: {} }
                    };
                }
            }
        }

        let finalMessage = "";
        if (!errorMessageForLog && !needRetry) {
            finalMessage = await formatMessage(job.config.messageTemplate, targetDoc, zaloAccount);
            
            if (actionType === 'sendMessage') {
                if (!accountKeyForTask) {
                    errorMessageForLog = 'Không tìm thấy tài khoản Zalo hợp lệ. Vui lòng đăng nhập QR trước.';
                    apiResponse = { status: false, message: errorMessageForLog, content: { error_code: -1, error_message: errorMessageForLog, data: {} } };
                } else {
                    try {
                        const result = await sendUserMessage({
                            accountKey: accountKeyForTask,
                            userId: uidPerson,
                            text: finalMessage,
                            attachments: []
                        });
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
                        const errMsg = String(err?.message || '');
                        if (/rate|429|limit/i.test(errMsg)) {
                            needRetry = true;
                            retryDelayMs = RETRY_DELAY_RATE_MS;
                        } else if (/login|cookie|unauth|forbidden|zpw|401|403|session/i.test(errMsg)) {
                            needRetry = true;
                            retryDelayMs = RETRY_DELAY_SESSION_MS;
                        }
                        apiResponse = {
                            status: false,
                            message: err?.message || 'Lỗi không xác định',
                            content: { error_code: -1, error_message: err?.message || 'Lỗi không xác định', data: {} }
                        };
                    }
                }
            } else if (actionType === 'checkFriend') {
                try {
                    const { getFriendRequestStatus } = await import('@/data/zalo/chat.actions');
                    const result = await getFriendRequestStatus({
                        accountKey: accountKeyForTask,
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
                try {
                    const { sendFriendRequest } = await import('@/data/zalo/chat.actions');
                    const result = await sendFriendRequest({
                        accountKey: accountKeyForTask,
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
            message: finalMessage || errorMessageForLog || (needRetry ? 'Thử lại sau (rate limit/session)' : ''),
            status: {
                status: apiResponse?.status ?? false,
                message: apiResponse?.message ?? (needRetry ? 'Tạm hoãn, thử lại sau' : ''),
                data: {
                    error_code: apiResponse?.content?.error_code ?? -1,
                    error_message: apiResponse?.content?.error_message ?? '',
                }
            },
            type: actionType,
            createBy: job.createdBy,
            customer: targetId,
            zalo: job.zaloAccount,
            schedule: job._id,
        };
        const newLog = await Logs.create(logPayload);
        const errorCode = apiResponse?.content?.error_code;

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

        if (needRetry) {
            return { retryable: true, retryDelayMs };
        }

        const statsUpdateField = apiResponse?.status ? 'statistics.completed' : 'statistics.failed';
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
        
        // Tìm đúng 1 task đến hạn gần nhất để xử lý tuần tự
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
            },
            { $limit: 1 }
        ]);
        
        // Không có task nào đến hạn
        if (!dueTasksDetails || dueTasksDetails.length === 0) {
            return {
                success: true,
                message: 'No due tasks to process.',
                count: 0
            };
        }

        // Format zaloAccount để tương thích với processSingleTask
        const rawDetail = dueTasksDetails[0];
        let zaloAccount = null;
        if (rawDetail.zaloAccountNew) {
            zaloAccount = {
                _id: rawDetail.zaloAccountNew._id,
                uid: rawDetail.zaloAccountNew.accountKey,
                name: rawDetail.zaloAccountNew.profile?.displayName || 'Zalo Account',
                accountKey: rawDetail.zaloAccountNew.accountKey
            };
        } else if (rawDetail.zaloAccountOld) {
            zaloAccount = rawDetail.zaloAccountOld;
        }

        if (!zaloAccount) {
            return {
                success: true,
                message: 'No valid Zalo account found for due tasks.',
                count: 0
            };
        }

        const taskDetail = {
            ...rawDetail,
            zaloAccount
        };

        // Đánh dấu task là đã xử lý để tránh worker khác xử lý trùng
        await ScheduledJob.updateOne(
            { _id: taskDetail.job._id, 'tasks._id': taskDetail.task._id, 'tasks.status': false },
            { $set: { 'tasks.$.status': true } }
        );

        let result;
        try {
            result = await processSingleTask(taskDetail);
        } catch (err) {
            console.error('[Scheduler] Lỗi khi xử lý task:', err);
        }

        if (result?.retryable && result?.retryDelayMs) {
            await ScheduledJob.updateOne(
                { _id: taskDetail.job._id, 'tasks._id': taskDetail.task._id },
                { $set: { 'tasks.$.status': false, 'tasks.$.scheduledFor': new Date(Date.now() + result.retryDelayMs) } }
            );
            await new Promise(r => setTimeout(r, SLEEP_AFTER_TASK_MS));
            return {
                success: true,
                message: 'Task deferred for retry (rate limit/session).',
                count: 1
            };
        }

        await new Promise(r => setTimeout(r, SLEEP_AFTER_TASK_MS));
        return {
            success: true,
            message: 'Scheduler triggered. Processed 1 task.',
            count: 1
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