'use server';

import Agenda from 'agenda';
import mongoose from 'mongoose';
import { CustomerWorkflow, WorkflowTemplate } from '@/models/workflows.model';
import Customer from '@/models/customer.model';
import Zalo from '@/models/zalo.model';
import Logs from '@/models/log.model';
import Setting from '@/models/setting.model';
import Form from '@/models/formclient';
import Variant from '@/models/variant.model';
import Service from '@/models/services.model';
import User from '@/models/users';
import { sendGP } from '@/function/drive/appscript';
import { ZaloAccount as ZaloAccountNew } from '@/models/zalo-account.model';
import { sendUserMessage, findUserUid, changeFriendAlias, getFriendRequestStatus, sendFriendRequest } from '@/data/zalo/chat.actions';
import dbConnect from '@/config/connectDB';
import { sendPreSurgeryMessageIfNeeded } from '@/data/customers/wraperdata.db';
import Appointment from '@/models/appointment.model';
import { processMessageConversation } from '@/utils/autoMessageCustomer';
import { getPagesFromAPI } from '@/lib/pancake-api';
import { validatePipelineStatusUpdate, getCurrentPipelineStatus } from '@/utils/pipelineStatus';
let agendaInstance = null;

// =============================================================
// == CÁC HẰNG SỐ CẤU HÌNH
// =============================================================
const actionMap = {
    'message': 'sendMessage',
    'friendRequest': 'addFriend',
    'checkFriend': 'checkFriend',
    'tag': 'tag',
    'findUid': 'findUid',
};

const MESSAGE_WORKFLOW_ID = '68b550ad8170a4fc74ff4ee5';       // Workflow 2 (Gửi tin nhắn)
const ALLOCATION_BELL_WORKFLOW_ID = '68b654a910dd5465ed70fc69'; // Workflow 3 (Phân bổ & Báo cáo)

const RETRYABLE_ERRORS = ['hourly', 'daily', 'no_accounts'];
const SYSTEM_USER_ID = '68b0af5cf58b8340827174e0';

const actionToStepMap = {
    friendRequest: 1, checkFriend: 1, tag: 1, findUid: 1,
    message: 2,
    allocation: 3, bell: 3, appointmentReminder: 5
};
const actionToNameMap = {
    message: 'Gửi tin nhắn Zalo', friendRequest: 'Gửi lời mời kết bạn',
    checkFriend: 'Kiểm tra trạng thái bạn bè', tag: 'Gắn thẻ Zalo',
    findUid: 'Tìm UID Zalo', allocation: 'Phân bổ cho Sale', bell: 'Gửi thông báo hệ thống',
    appointmentReminder: 'Nhắc lịch hẹn'
};


// =============================================================
// == 1. CÁC HÀM HELPER CƠ BẢN
// =============================================================

/**
 * Xử lý một chuỗi tin nhắn thô, thay thế các placeholder (ví dụ: {name}) bằng dữ liệu thực tế của khách hàng.
 * @param {string} rawMessage - Chuỗi tin nhắn gốc chứa placeholder.
 * @param {object} customer - Đối tượng khách hàng từ MongoDB.
 * @returns {Promise<string>} Chuỗi tin nhắn đã được xử lý.
 */
async function processMessage(rawMessage, customer) {
    if (!rawMessage || !customer) return '';
    const placeholders = rawMessage.match(/{([^}]+)}/g);
    if (!placeholders) return rawMessage;

    const placeholderNames = [...new Set(placeholders.map(p => p.slice(1, -1)))];
    const staticNames = ['name', 'phone', 'email', 'formname'];
    const variantNames = placeholderNames.filter(name => !staticNames.includes(name));

    const [formResult, variantsResult] = await Promise.all([
        placeholderNames.includes('formname') && customer.source
            ? Form.findById(customer.source).select('name').lean()
            : Promise.resolve(null),
        variantNames.length > 0
            ? Variant.find({ name: { $in: variantNames } }).lean()
            : Promise.resolve([])
    ]);

    const replacementMap = {
        name: customer.name || '',
        phone: customer.phone || '',
        email: customer.email || '',
        formname: formResult?.name || 'phòng khám',
    };

    variantsResult.forEach(variant => {
        if (variant.phrases && variant.phrases.length > 0) {
            replacementMap[variant.name] = variant.phrases[Math.floor(Math.random() * variant.phrases.length)];
        }
    });

    return rawMessage.replace(/{([^}]+)}/g, (match, key) => replacementMap[key] !== undefined ? replacementMap[key] : match);
}

/**
 * Gửi yêu cầu revalidate cache tới Next.js API để cập nhật giao diện người dùng.
 */
function triggerRevalidation() {
    console.log('[Agenda] Triggering revalidation via API for tag: customers');
    try {
        const host = process.env.URL || 'http://localhost:3000';
        const secret = process.env.REVALIDATE_SECRET_TOKEN;
        fetch(`${host}/api/cache/retag`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ secret, tag: 'customers' }),
        });
    } catch (revalError) {
        console.error('[Agenda] Lỗi khi gọi API revalidate:', revalError);
    }
}

// =============================================================
// == 2. CÁC HÀM XỬ LÝ JOB (PROCESSORS)
// =============================================================

/**
 * Hàm xử lý chung cho các job Zalo ban đầu (WF1) và job 'message' (WF2).
 * @param {import('agenda').Job} job - Đối tượng job từ Agenda.
 */
async function genericJobProcessor(job) {
    const { customerId, params, cwId } = job.attrs.data;
    const jobName = job.attrs.name;

    try {
        const customer = await Customer.findById(customerId);
        if (!customer) throw new Error(`Không tìm thấy Customer ID ${customerId}`);

        const rawMessage = params?.message || '';
        const processedMessage = await processMessage(rawMessage, customer);
        let selectedZalo;

        if (jobName === 'findUid') {
            const selection = await findNextAvailableZaloAccount();
            if (!selection.account) throw new Error(selection.reason);
            selectedZalo = selection.account;
        } else {
            // Ưu tiên tìm từ ZaloAccount mới (Zalo Hệ Thống)
            if (customer.uid?.[0]?.zalo) {
                // Thử tìm trong ZaloAccount mới trước
                const zaloAccountNew = await ZaloAccountNew.findById(customer.uid[0].zalo).lean();
                if (zaloAccountNew) {
                    // Format để tương thích với code cũ
                    selectedZalo = {
                        _id: zaloAccountNew._id,
                        uid: zaloAccountNew.accountKey,
                        name: zaloAccountNew.profile?.displayName || 'Zalo Account'
                    };
                } else {
                    // Fallback: tìm trong model cũ
                    selectedZalo = await Zalo.findById(customer.uid[0].zalo);
                }
            }
            
            // Nếu vẫn chưa có, lấy account active đầu tiên từ ZaloAccount mới
            if (!selectedZalo) {
                const fallbackNew = await ZaloAccountNew.findOne({ status: 'active' }).sort({ updatedAt: 1 }).lean();
                if (fallbackNew) {
                    selectedZalo = {
                        _id: fallbackNew._id,
                        uid: fallbackNew.accountKey,
                        name: fallbackNew.profile?.displayName || 'Zalo Account'
                    };
                }
            }
            
            // Fallback cuối cùng: model cũ
            if (!selectedZalo) {
                selectedZalo = await Zalo.findOne();
            }
            
            if (!selectedZalo) throw new Error('No Zalo account available for this action');
        }

        const uid = selectedZalo.uid;
        const zaloId = selectedZalo._id;
        const actionType = actionMap[jobName];
        
        // Xử lý sendMessage bằng zca-js, các actionType khác vẫn dùng actionZalo
        let response;
        if (actionType === 'sendMessage') {
            // Lấy accountKey từ ZaloAccount mới
            let accountKey = null;
            try {
                const zaloAccount = await ZaloAccountNew.findOne({
                    $or: [
                        { 'profile.zaloId': String(uid).trim() },
                        { accountKey: String(uid).trim() }
                    ],
                    status: 'active'
                }).sort({ updatedAt: 1 }).lean();
                
                if (zaloAccount?.accountKey) {
                    accountKey = zaloAccount.accountKey;
                } else {
                    const fallbackAccount = await ZaloAccountNew.findOne({ 
                        status: 'active' 
                    }).sort({ updatedAt: 1 }).lean();
                    if (fallbackAccount?.accountKey) {
                        accountKey = fallbackAccount.accountKey;
                    }
                }
            } catch (err) {
                console.error('[agenda workflow] Lỗi khi tìm accountKey:', err);
            }
            
            if (!accountKey) {
                response = { status: false, message: 'Không tìm thấy tài khoản Zalo hợp lệ', content: { error_code: -1, error_message: 'Không tìm thấy tài khoản Zalo hợp lệ', data: {} } };
            } else {
                try {
                    const result = await sendUserMessage({
                        accountKey: accountKey,
                        userId: customer.uid?.[0]?.uid || '',
                        text: processedMessage,
                        attachments: []
                    });
                    
                    response = {
                        status: result.ok || false,
                        message: result.ok ? 'Gửi tin nhắn thành công' : (result.message || 'Gửi tin nhắn thất bại'),
                        content: {
                            error_code: result.ok ? 0 : -1,
                            error_message: result.ok ? '' : (result.message || 'Gửi tin nhắn thất bại'),
                            data: result.ack || {}
                        }
                    };
                } catch (err) {
                    console.error('[agenda workflow] Lỗi khi gửi tin nhắn:', err);
                    response = { status: false, message: err?.message || 'Lỗi không xác định', content: { error_code: -1, error_message: err?.message || 'Lỗi không xác định', data: {} } };
                }
            }
        } else {
            // Tất cả actionType đều dùng zca-js
            let accountKey = null;
            
            // Lấy accountKey từ selectedZalo
            if (selectedZalo.accountKey) {
                accountKey = selectedZalo.accountKey;
            } else if (selectedZalo.uid) {
                // Nếu là model cũ, tìm trong ZaloAccountNew
                const zaloAccount = await ZaloAccountNew.findOne({
                    $or: [
                        { 'profile.zaloId': String(selectedZalo.uid).trim() },
                        { accountKey: String(selectedZalo.uid).trim() }
                    ],
                    status: 'active'
                }).sort({ updatedAt: 1 }).lean();
                
                if (zaloAccount?.accountKey) {
                    accountKey = zaloAccount.accountKey;
                } else {
                    // Fallback: lấy account đầu tiên có status active
                    const fallbackAccount = await ZaloAccountNew.findOne({ 
                        status: 'active' 
                    }).sort({ updatedAt: 1 }).lean();
                    if (fallbackAccount?.accountKey) {
                        accountKey = fallbackAccount.accountKey;
                    }
                }
            }
            
            if (!accountKey) {
                response = { status: false, message: 'Không tìm thấy tài khoản Zalo hợp lệ', content: { error_code: -1, error_message: 'Không tìm thấy tài khoản Zalo hợp lệ', data: {} } };
            } else {
                try {
                    if (actionType === 'findUid') {
                        // Sử dụng findUserUid từ zca-js
                        const phone = customer.phone || '';
                        const findResult = await findUserUid({
                            accountKey: accountKey,
                            phoneOrUid: phone
                        });
                        
                        if (findResult.ok) {
                            response = {
                                status: true,
                                message: 'Tìm UID thành công',
                                content: {
                                    error_code: 0,
                                    error_message: '',
                                    data: {
                                        uid: findResult.uid,
                                        zalo_name: findResult.displayName,
                                        avatar: findResult.avatar
                                    }
                                }
                            };
                        } else {
                            response = {
                                status: false,
                                message: findResult.message || 'Tìm UID thất bại',
                                content: {
                                    error_code: -1,
                                    error_message: findResult.message || 'Tìm UID thất bại',
                                    data: {}
                                }
                            };
                        }
                    } else if (actionType === 'tag') {
                        // Sử dụng changeFriendAlias từ zca-js
                        const uidPerson = customer.uid?.[0]?.uid || '';
                        if (!uidPerson) {
                            response = { status: false, message: 'Không tìm thấy UID của khách hàng', content: { error_code: -1, error_message: 'Không tìm thấy UID của khách hàng', data: {} } };
                        } else {
                            const alias = processedMessage || customer.zaloname || '';
                            const result = await changeFriendAlias({
                                accountKey: accountKey,
                                userId: uidPerson,
                                alias: alias
                            });
                            
                            response = {
                                status: result.status,
                                message: result.message || (result.status ? 'Đổi tên gợi nhớ thành công' : 'Đổi tên gợi nhớ thất bại'),
                                content: {
                                    error_code: result.error_code || (result.status ? 0 : -1),
                                    error_message: result.error_message || '',
                                    data: result.content?.data || {}
                                }
                            };
                        }
                    } else if (actionType === 'checkFriend') {
                        // Sử dụng getFriendRequestStatus từ zca-js
                        const uidPerson = customer.uid?.[0]?.uid || '';
                        if (!uidPerson) {
                            response = { status: false, message: 'Không tìm thấy UID của khách hàng', content: { error_code: -1, error_message: 'Không tìm thấy UID của khách hàng', data: {} } };
                        } else {
                            const result = await getFriendRequestStatus({
                                accountKey: accountKey,
                                friendId: uidPerson
                            });
                            
                            // Format response để tương thích với code cũ
                            // is_friend: 1 = bạn bè, 0 = không phải bạn bè
                            const isFriend = result.ok && result.is_friend === 1 ? 1 : 0;
                            
                            response = {
                                status: result.ok,
                                message: result.ok ? 'Kiểm tra bạn bè thành công' : (result.message || 'Kiểm tra bạn bè thất bại'),
                                content: {
                                    error_code: result.ok ? 0 : -1,
                                    error_message: result.ok ? String(isFriend) : (result.message || 'Kiểm tra bạn bè thất bại'),
                                    data: { isFriend },
                                    isFriend
                                }
                            };
                        }
                    } else if (actionType === 'addFriend') {
                        // Sử dụng sendFriendRequest từ zca-js
                        const uidPerson = customer.uid?.[0]?.uid || '';
                        if (!uidPerson) {
                            response = { status: false, message: 'Không tìm thấy UID của khách hàng', content: { error_code: -1, error_message: 'Không tìm thấy UID của khách hàng', data: {} } };
                        } else {
                            const result = await sendFriendRequest({
                                accountKey: accountKey,
                                userId: uidPerson,
                                msg: processedMessage || 'Xin chào, hãy kết bạn với tôi!'
                            });
                            
                            // Format response để tương thích với code cũ
                            response = {
                                status: result.ok,
                                message: result.ok ? 'Gửi lời mời kết bạn thành công' : (result.message || 'Gửi lời mời kết bạn thất bại'),
                                content: {
                                    error_code: result.ok ? 0 : -1,
                                    error_message: result.ok ? '' : (result.message || 'Gửi lời mời kết bạn thất bại'),
                                    data: result.result || {}
                                }
                            };
                        }
                    } else {
                        // Các actionType khác vẫn dùng actionZalo (nếu còn)
                        const { actionZalo } = await import('@/function/drive/appscript');
                        response = await actionZalo({ phone: customer.phone, uidPerson: customer.uid?.[0]?.uid || '', actionType, message: processedMessage, uid });
                    }
                } catch (err) {
                    console.error(`[agenda workflow] Lỗi khi thực hiện ${actionType}:`, err);
                    response = { status: false, message: err?.message || 'Lỗi không xác định', content: { error_code: -1, error_message: err?.message || 'Lỗi không xác định', data: {} } };
                }
            }
        }

        await Logs.create({
            status: { status: response?.status || false, message: processedMessage, data: { error_code: response?.content?.error_code || null, error_message: response?.content?.error_message || (response?.status ? '' : 'Invalid response from AppScript') } },
            type: actionType, createBy: SYSTEM_USER_ID, customer: customerId, zalo: zaloId,
        });

        if (!response?.status) throw new Error(response?.message || 'Action Zalo failed or returned invalid response');

        switch (jobName) {
            case 'friendRequest':
                if (customer.uid.length > 0) {
                    customer.uid[0].isReques = 1;
                    customer.pipelineStatus = 'consulted';
                    await customer.save();
                    triggerRevalidation();
                }
                break;
            case 'checkFriend':
                if (customer.uid.length > 0) {
                    // Lấy isFriend từ response.content.isFriend hoặc response.content.data.isFriend
                    const isFriendValue = response.content?.isFriend ?? response.content?.data?.isFriend ?? 0;
                    customer.uid[0].isFriend = isFriendValue === 1 ? 1 : 0;
                    await customer.save();
                    triggerRevalidation();
                }
                break;
            case 'tag':
                if (processedMessage) {
                    customer.zaloname = processedMessage;
                    await customer.save();
                    triggerRevalidation();
                }
                break;
            case 'message':
                const newStatus = response?.status ? 'msg_success_2' : 'msg_error_2';
                // Kiểm tra xem có nên cập nhật không (chỉ cập nhật nếu step mới > step hiện tại)
                const validatedStatus = validatePipelineStatusUpdate(customer, newStatus);
                if (validatedStatus) {
                    await Customer.updateOne({ _id: customerId }, {
                        $set: {
                            'pipelineStatus.0': validatedStatus,
                            'pipelineStatus.2': validatedStatus
                        }
                    });
                    triggerRevalidation();
                }
                break;
            case 'findUid':
                // Không cần update rate limit cho ZaloAccountNew vì không có rate limit
                const foundUid = response.content?.data?.uid;
                const newValidStatus = 'valid_1';
                // Kiểm tra xem có nên cập nhật không (chỉ cập nhật nếu step mới > step hiện tại)
                const validatedValidStatus = validatePipelineStatusUpdate(customer, newValidStatus);
                
                if (foundUid) {
                    // Tìm zaloId từ accountKey
                    let finalZaloId = zaloId;
                    if (selectedZalo.accountKey) {
                        const zaloAccountDoc = await ZaloAccountNew.findOne({ accountKey: selectedZalo.accountKey }).lean();
                        if (zaloAccountDoc) {
                            finalZaloId = zaloAccountDoc._id;
                        }
                    }
                    
                    customer.uid = [{ zalo: finalZaloId, uid: normalizeUid(foundUid), isFriend: 0, isReques: 0 }];
                    customer.zaloavt = response.content?.data?.avatar || null;
                    customer.zaloname = response.content?.data?.zalo_name || null;
                    
                    // Chỉ cập nhật pipelineStatus nếu step mới > step hiện tại
                    if (validatedValidStatus) {
                        customer.pipelineStatus[0] = validatedValidStatus;
                        customer.pipelineStatus[1] = validatedValidStatus;
                    }
                    await customer.save();
                    triggerRevalidation();
                } else {
                    // Chỉ cập nhật pipelineStatus nếu step mới > step hiện tại
                    if (validatedValidStatus) {
                        customer.pipelineStatus[0] = validatedValidStatus;
                        customer.pipelineStatus[1] = validatedValidStatus;
                    }
                    await customer.save();
                    triggerRevalidation();
                }
                setImmediate(() => { attachWorkflow(customerId, MESSAGE_WORKFLOW_ID).catch(console.error); });
                break;
        }
        await logCareHistory(customerId, jobName, 'success');
        await updateStepStatus(cwId, jobName, 'completed', customerId);
    } catch (error) {
        console.error(`[Job ${jobName}] Xảy ra lỗi: "${error.message}"`);
        await logCareHistory(customerId, jobName, 'failed', error.message);
        if (RETRYABLE_ERRORS.includes(error.message)) {
            await handleJobFailure(job, error, cwId, jobName);
        } else {
            await updateStepStatus(cwId, jobName, 'failed');
        }
    }
}

/**
 * Hàm xử lý job 'allocation' (Bước đầu của WF3) - Phân bổ khách hàng cho Sale.
 * @param {import('agenda').Job} job - Đối tượng job từ Agenda.
 */
async function allocationJobProcessor(job) {
    const { customerId, cwId } = job.attrs.data;
    const jobName = 'allocation';
    console.log(`[Job ${jobName}] Bắt đầu xử lý cho KH: ${customerId}`);
    let newStatus = 'undetermined_3'
    try {
        const customer = await Customer.findById(customerId);
        if (!customer) throw new Error(`Không tìm thấy KH ID: ${customerId}`);
        if (!customer.uid || customer.uid.length === 0) throw new Error(`KH ${customerId} chưa có UID để phân bổ.`);

        const requiredGroups = await getRequiredGroups(customer.tags);
        if (requiredGroups.length === 0) {
            console.log(`[Job ${jobName}] KH ${customerId} không có tag dịch vụ nào cần phân bổ.`);
            await logCareHistory(customerId, jobName, 'success', 'Không có tag dịch vụ nào cần phân bổ.');
            await updateStepStatus(cwId, jobName, 'completed', customerId);
            return;
        }

        const zaloAccountId = customer.uid[0].zalo;
        let assignmentsMade = 0;
        for (const group of requiredGroups) {
            const isAlreadyAssigned = customer.assignees.some(a => a.group === group);
            if (isAlreadyAssigned) {
                console.log(`[Job ${jobName}] KH đã được gán cho nhóm ${group}. Bỏ qua.`);
                continue;
            }
            const nextSale = await findNextSaleForGroup(group, zaloAccountId);
            if (nextSale) {
                customer.assignees.push({ user: nextSale._id, group: group, assignedAt: new Date() });
                assignmentsMade++;
                console.log(`[Job ${jobName}] Đã gán KH ${customerId} cho Sale ${nextSale._id} nhóm ${group}.`);

                // ==========================================================
                // == THÊM LOGIC CẬP NHẬT newStatus TẠI ĐÂY ==
                if (group === 'noi_khoa') {
                    newStatus = 'noikhoa_3';
                } else if (group === 'ngoai_khoa') {
                    newStatus = 'ngoaikhoa_3';
                }
                // ==========================================================

            } else {
                console.log(`[Job ${jobName}] Không tìm thấy Sale phù hợp cho nhóm ${group}.`);
            }
        }

        customer.pipelineStatus[0] = newStatus;
        customer.pipelineStatus[3] = newStatus;
        await customer.save();
        triggerRevalidation();
        await logCareHistory(customerId, jobName, newStatus == 'undetermined_3' ? 'failed' : 'success');
        await updateStepStatus(cwId, jobName, 'completed', customerId);
    } catch (error) {
        console.error(`[Job ${jobName}] Lỗi nghiêm trọng: "${error.message}"`);
        await logCareHistory(customerId, jobName, 'failed', error.message);
        await updateStepStatus(cwId, jobName, 'failed');
    }
}

/**
 * Hàm xử lý job 'bell' (Bước sau của WF3) - Gửi thông báo hệ thống.
 * @param {import('agenda').Job} job - Đối tượng job từ Agenda.
 */
async function bellJobProcessor(job) {
    const { customerId, cwId } = job.attrs.data;
    const jobName = 'bell';
    console.log(`[Job ${jobName}] Bắt đầu gửi thông báo cho KH: ${customerId}`);
    try {
        const customer = await Customer.findById(customerId).populate('care.createBy', 'name').lean();
        if (!customer) throw new Error(`Không tìm thấy KH ID: ${customerId}`);

        // BƯỚC 1: Trích xuất các ID người dùng từ trong content để tra cứu tên
        const manualAddRegex = /bởi ([0-9a-f]{24})\.$/;
        const userIdsFromContent = new Set();
        customer.care.forEach(entry => {
            const match = entry.content.match(manualAddRegex);
            if (match && match[1]) {
                userIdsFromContent.add(match[1]);
            }
        });

        // BƯỚC 2: Tra cứu tên từ các ID đã thu thập được
        const idToNameMap = new Map();
        if (userIdsFromContent.size > 0) {
            const users = await User.find({ _id: { $in: Array.from(userIdsFromContent) } }).select('name').lean();
            users.forEach(user => {
                idToNameMap.set(user._id.toString(), user.name);
            });
        }

        // BƯỚC 3: Gọi hàm format với map chứa tên đã tra cứu
        const careHistoryMessage = formatCareHistoryForNotification(customer.care, idToNameMap);

        const assignedUsers = await User.find({ _id: { $in: customer.assignees.map(a => a.user) } }).select('name').lean();
        const assignedNames = assignedUsers.map(u => u.name).join(', ');
        const finalMessage = `🔔 KHÁCH HÀNG MỚI\n` + `--------------------\n` + `👤 Tên: ${customer.name}\n` + `📞 SĐT: ${customer.phone}\n` + `👨‍💼 NV được gán: ${assignedNames || 'Chưa có'}\n` + `--------------------\n` + `LỊCH SỬ CHĂM SÓC:\n${careHistoryMessage}`;

        const success = await sendGP(finalMessage);

        if (!success) throw new Error('Gửi thông báo qua Google Apps Script thất bại');

        console.log(`[Job ${jobName}] Đã gửi thông báo thành công cho KH ${customerId}.`);
        await logCareHistory(customerId, jobName, 'success');
        await updateStepStatus(cwId, jobName, 'completed', customerId);
    } catch (error) {
        console.error(`[Job ${jobName}] Xảy ra lỗi: "${error.message}"`);
        await logCareHistory(customerId, jobName, 'failed', error.message);
        await updateStepStatus(cwId, jobName, 'failed');
    }
}


// =============================================================
// == 3. CÁC HÀM HELPER QUẢN LÝ WORKFLOW VÀ JOB
// =============================================================

/**
 * Gán một workflow mới cho khách hàng và đặt lịch các job tương ứng.
 * @param {string} customerId - ID của khách hàng.
 * @param {string} templateId - ID của WorkflowTemplate.
 */
async function attachWorkflow(customerId, templateId) {
    const existingAssignment = await CustomerWorkflow.findOne({ customerId, templateId });
    if (existingAssignment) {
        console.log(`[attachWorkflow] Bỏ qua vì KH ${customerId} đã có WF ${templateId}.`);
        return;
    }
    const template = await WorkflowTemplate.findById(templateId);
    if (!template) {
        console.error(`[attachWorkflow] Không tìm thấy template ID: ${templateId}`);
        return;
    }
    const customerWorkflow = new CustomerWorkflow({
        customerId, templateId, startTime: new Date(),
        steps: template.steps.map(step => ({
            action: step.action, scheduledTime: new Date(Date.now() + (step.delay * 60 * 1000)),
            status: 'pending', params: step.params,
        })),
        nextStepTime: new Date(Date.now() + (template.steps[0]?.delay * 60 * 1000 || 0)), status: 'active',
    });
    await customerWorkflow.save();
    const agenda = await initAgenda();
    for (const step of customerWorkflow.steps) {
        await agenda.schedule(step.scheduledTime, step.action, {
            customerId: customerId.toString(), cwId: customerWorkflow._id.toString(), params: step.params,
        });
    }
    await Customer.updateOne({ _id: customerId }, { $addToSet: { workflowTemplates: templateId } });
    console.log(`[attachWorkflow] Đã gán thành công WF ${template.name} cho KH ${customerId}`);
}

/**
 * Cập nhật trạng thái một bước trong workflow và kích hoạt workflow tiếp theo nếu cần.
 * @param {string} cwId - ID của CustomerWorkflow.
 * @param {string} action - Tên hành động (job) vừa hoàn thành.
 * @param {'completed'|'failed'} status - Trạng thái mới của bước.
 * @param {string} customerId - ID của khách hàng để nối chuỗi workflow.
 */
async function updateStepStatus(cwId, action, status, customerId) {
    const cw = await CustomerWorkflow.findById(cwId);
    if (!cw) return;
    const step = cw.steps.find(s => s.action === action && s.status === 'pending');
    if (step) {
        step.status = status;
        cw.nextStepTime = cw.steps.find(s => s.status === 'pending')?.scheduledTime || null;
        if (cw.steps.every(s => s.status !== 'pending')) {
            cw.status = 'completed';
        }
        await cw.save();

        if (cw.status === 'completed' && cw.templateId.toString() === MESSAGE_WORKFLOW_ID) {
            console.log(`[Workflow Chain] WF2 (${MESSAGE_WORKFLOW_ID}) hoàn tất. Kích hoạt WF3 (${ALLOCATION_BELL_WORKFLOW_ID}).`);
            setImmediate(() => attachWorkflow(customerId, ALLOCATION_BELL_WORKFLOW_ID).catch(console.error));
        }
    }
}

/**
 * Tìm tài khoản Zalo tiếp theo có sẵn để thực hiện hành động, sử dụng ZaloAccountNew (Zalo Hệ Thống).
 * @returns {Promise<{account: object|null, reason: string|null}>} Tài khoản Zalo hoặc lý do không có.
 */
async function findNextAvailableZaloAccount() {
    try {
        await dbConnect();
        
        // Tìm tài khoản active đầu tiên từ ZaloAccountNew (Zalo Hệ Thống)
        // Sắp xếp theo updatedAt tăng dần (cũ nhất trước) để ưu tiên tài khoản ít được sử dụng nhất
        const zaloAccount = await ZaloAccountNew.findOne({ 
            status: 'active' 
        }).sort({ updatedAt: 1 }).lean();
        
        if (zaloAccount) {
            // Format để tương thích với code cũ
            return {
                account: {
                    _id: zaloAccount._id,
                    uid: zaloAccount.accountKey,
                    accountKey: zaloAccount.accountKey,
                    name: zaloAccount.profile?.displayName || 'Zalo Account',
                    rateLimitPerHour: 999, // Không giới hạn trong hệ thống mới
                    rateLimitPerDay: 9999
                },
                reason: null
            };
        }
        
        return { account: null, reason: 'no_accounts' };
    } catch (err) {
        console.error('[findNextAvailableZaloAccount] Lỗi:', err);
        return { account: null, reason: 'no_accounts' };
    }
}

/**
 * Xử lý khi một job thất bại, quyết định thử lại (retry) hoặc đánh dấu là 'failed'.
 * @param {import('agenda').Job} job - Đối tượng job từ Agenda.
 * @param {Error} error - Lỗi xảy ra.
 * @param {string} cwId - ID của CustomerWorkflow.
 * @param {string} action - Tên hành động (job) bị lỗi.
 */
async function handleJobFailure(job, error, cwId, action) {
    const cw = await CustomerWorkflow.findById(cwId);
    if (!cw) return;
    const step = cw.steps.find(s => s.action === action && s.status === 'pending');
    if (!step) return;
    step.retryCount = (step.retryCount || 0) + 1;
    let retryDelay = 300000; // 5 phút
    if (error.message === 'hourly') retryDelay = 3600000; // 1 giờ
    else if (error.message === 'daily') retryDelay = 86400000; // 24 giờ
    if (step.retryCount < 10) {
        job.schedule(new Date(Date.now() + retryDelay));
        await job.save();
    } else {
        await updateStepStatus(cwId, action, 'failed');
    }
    await cw.save();
}

/**
 * Chuẩn hóa chuỗi UID Zalo (loại bỏ ký tự không phải số).
 * @param {string} u - Chuỗi UID đầu vào.
 * @returns {string} Chuỗi UID đã được chuẩn hóa.
 */
function normalizeUid(u) {
    return String(u ?? "").trim().replace(/\D/g, "");
}

// =============================================================
// == 4. CÁC HÀM HELPER CHO HÀNH ĐỘNG MỚI
// =============================================================

/**
 * Ghi lại một mục vào lịch sử chăm sóc (customer.care) của khách hàng.
 * @param {string} customerId - ID của khách hàng.
 * @param {string} jobName - Tên của job đang chạy.
 * @param {'success'|'failed'} status - Trạng thái của hành động.
 * @param {string} [errorMessage=''] - Thông báo lỗi nếu có.
 */
async function logCareHistory(customerId, jobName, status, errorMessage = '') {
    const step = actionToStepMap[jobName] || 0;
    const actionName = actionToNameMap[jobName] || jobName;
    let content = `Hành động [${actionName}] đã hoàn thành thành công.`;
    if (status === 'failed') {
        content = `Hành động [${actionName}] thất bại: ${errorMessage}`;
    } else if (errorMessage) {
        content = `Hành động [${actionName}] thành công: ${errorMessage}`;
    }
    try {
        await Customer.updateOne({ _id: customerId }, {
            $push: { care: { content: content, step: step, createBy: SYSTEM_USER_ID, createAt: new Date() } }
        });
    } catch (error) {
        console.error(`[logCareHistory] Lỗi khi ghi care log cho KH ${customerId}:`, error);
    }
}

/**
 * Lấy danh sách các nhóm chuyên môn ('noi_khoa', 'ngoai_khoa') dựa trên tags của khách hàng.
 * @param {string[]} tags - Mảng các ID dịch vụ (tags) của khách hàng.
 * @returns {Promise<string[]>} Mảng các nhóm chuyên môn duy nhất.
 */
async function getRequiredGroups(tags) {
    if (!tags || tags.length === 0) return [];
    try {
        const services = await Service.find({ _id: { $in: tags } }).select('type').lean();
        const groups = new Set(services.map(s => s.type));
        return Array.from(groups);
    } catch (error) {
        console.error("Lỗi khi lấy nhóm dịch vụ từ tags:", error);
        return [];
    }
}

/**
 * Tìm nhân viên Sale tiếp theo cho một nhóm cụ thể theo cơ chế round-robin.
 * @param {string} group - Nhóm chuyên môn ('noi_khoa' hoặc 'ngoai_khoa').
 * @param {string} zaloAccountId - ID tài khoản Zalo đã tìm ra khách hàng.
 * @returns {Promise<object|null>} Đối tượng User của Sale hoặc null nếu không tìm thấy.
 */
async function findNextSaleForGroup(group, zaloAccountId) {
    const zaloAccount = await Zalo.findById(zaloAccountId).select('roles').lean();
    if (!zaloAccount || zaloAccount.roles.length === 0) {
        console.log(`Zalo ${zaloAccountId} không được gán cho user nào.`);
        return null;
    }
    const candidateSales = await User.find({
        role: 'Sale',
        group: group
    }).sort({ _id: 1 }).lean();
    if (candidateSales.length === 0) {
        console.log(`Không có Sale nhóm ${group} được Zalo ${zaloAccountId} cho phép.`);
        return null;
    }
    const settingKey = `lastAssignedSaleIndex_${group}`;
    const lastIndexSetting = await Setting.findOne({ key: settingKey });
    const lastIndex = lastIndexSetting ? Number(lastIndexSetting.value) : -1;
    const nextIndex = (lastIndex + 1) % candidateSales.length;
    const selectedSale = candidateSales[nextIndex];
    await Setting.updateOne({ key: settingKey }, { $set: { value: nextIndex.toString() } }, { upsert: true });
    return selectedSale;
}

/**
 * Định dạng lịch sử chăm sóc (care array) thành một chuỗi tin nhắn dễ đọc.
 * @param {Array} careArray - Mảng care từ đối tượng customer.
 * @returns {string} Chuỗi tin nhắn đã được định dạng.
 */
function formatCareHistoryForNotification(careArray, idToNameMap = new Map()) {
    if (!careArray || careArray.length === 0) return "Chưa có lịch sử chăm sóc.";

    const manualAddRegex = /Khách hàng được thêm thủ công bởi ([0-9a-f]{24})\./;

    const groupedByStep = careArray.reduce((acc, entry) => {
        const step = entry.step || 0;
        if (!acc[step]) acc[step] = [];
        acc[step].push(entry);
        return acc;
    }, {});

    let message = "";
    Object.keys(groupedByStep).sort((a, b) => a - b).forEach((step, index) => {
        if (index > 0) message += "\n";
        message += `--- Bước ${step} ---\n`;

        groupedByStep[step].forEach(entry => {
            const match = entry.content.match(manualAddRegex);

            // Trường hợp 1: Content khớp với mẫu "thêm thủ công"
            if (match && match[1]) {
                const userId = match[1];
                const creatorName = idToNameMap.get(userId);

                if (creatorName) {
                    // Nếu tìm thấy tên, thay thế ID bằng tên và không thêm "(bởi...)"
                    message += `+ Khách hàng được thêm thủ công bởi ${creatorName}.\n`;
                } else {
                    // Nếu không tìm thấy tên, giữ nguyên content gốc và thêm người tạo log
                    let userName = 'Hệ thống';
                    if (entry.createBy) {
                        userName = (typeof entry.createBy === 'object' && entry.createBy.name) ? entry.createBy.name : `User (${entry.createBy.toString().slice(-6)})`;
                    }
                    message += `+ ${entry.content} (bởi ${userName})\n`;
                }
            }
            // Trường hợp 2: Content thông thường
            else {
                let userName = 'Hệ thống';
                if (entry.createBy) {
                    userName = (typeof entry.createBy === 'object' && entry.createBy.name) ? entry.createBy.name : `User (${entry.createBy.toString().slice(-6)})`;
                }
                message += `+ ${entry.content} (bởi ${userName})\n`;
            }
        });
    });
    return message;
}

// =============================================================
// == Processor mới: appointmentReminder
//    - Lấy Appointment + Customer
//    - Gửi tin nhắn nhắc hẹn qua Zalo
//    - Gửi thông báo bell (sendGP)
//    - Ghi care log bước 5
// =============================================================
async function appointmentReminderProcessor(job) {
    const { appointmentId, customerId } = job.attrs.data || {};
    const jobName = 'appointmentReminder';

    try {
        // 1) Lấy dữ liệu và populate thêm service
        const appointment = await Appointment.findById(appointmentId)
            .populate('customer', 'name phone uid')
            .populate('createdBy', 'name')
            .populate('service', 'name') // Lấy tên dịch vụ
            .lean();

        if (!appointment || !appointment.customer) {
            throw new Error(`Không tìm thấy dữ liệu đầy đủ cho Appointment ID ${appointmentId}`);
        }

        // 2) Chuẩn hoá dữ liệu hiển thị mới
        const typeLabel = appointment.appointmentType === 'surgery' ? 'Phẫu thuật' : 'Tư vấn';
        const timeStr = new Date(appointment.appointmentDate).toLocaleString('vi-VN', { hour12: false });
        // Tên lịch hẹn giờ được ghép từ liệu trình và dịch vụ
        const appointmentTitle = `${appointment.treatmentCourse} (${appointment.service?.name || 'N/A'})`;
        const noteStr = appointment.notes?.trim() ? appointment.notes.trim() : 'Không có';

        // 3) Soạn nội dung nhắc hẹn Zalo (đã cập nhật)
        const reminderMessage =
            `[NHẮC HẸN] ${appointment.customer.name || ''}\n` +
            `- Lịch hẹn: ${appointmentTitle}\n` +
            `- Loại hẹn: ${typeLabel}\n` +
            `- Thời gian: ${timeStr}\n` +
            `- Ghi chú: ${noteStr}`;

        // 4) Gửi tin nhắn Zalo tới KH - Sử dụng ZaloAccountNew (Zalo Hệ Thống)
        let accountKey = null;
        let zaloAccountId = null;
        
        try {
            await dbConnect(); // Đảm bảo kết nối DB
            
            // Ưu tiên 1: Tìm account từ customer.uid[0].zalo (nếu có và là ZaloAccountNew)
            if (appointment.customer.uid?.[0]?.zalo) {
                try {
                    const zaloAccount = await ZaloAccountNew.findById(appointment.customer.uid[0].zalo)
                        .select('accountKey status')
                        .lean();
                    
                    if (zaloAccount?.status === 'active' && zaloAccount?.accountKey) {
                        accountKey = zaloAccount.accountKey;
                        zaloAccountId = zaloAccount._id;
                        console.log('[agenda appointmentReminder] ✅ Tìm thấy account từ customer.uid:', accountKey);
                    }
                } catch (err) {
                    // Có thể là model Zalo cũ, bỏ qua và tìm account active
                    console.log('[agenda appointmentReminder] customer.uid[0].zalo không phải ZaloAccountNew, tìm account active');
                }
            }
            
            // Ưu tiên 2: Lấy account active đầu tiên từ ZaloAccountNew (Zalo Hệ Thống)
            if (!accountKey) {
                const fallbackAccount = await ZaloAccountNew.findOne({ 
                    status: 'active' 
                }).sort({ updatedAt: 1 }).select('accountKey _id status').lean();
                
                if (fallbackAccount?.accountKey) {
                    accountKey = fallbackAccount.accountKey;
                    zaloAccountId = fallbackAccount._id;
                    console.log('[agenda appointmentReminder] ✅ Sử dụng account active đầu tiên:', accountKey);
                } else {
                    // Kiểm tra xem có account nào trong hệ thống không
                    const totalAccounts = await ZaloAccountNew.countDocuments({});
                    const activeAccounts = await ZaloAccountNew.countDocuments({ status: 'active' });
                    console.error('[agenda appointmentReminder] ❌ Không tìm thấy account active. Tổng số account:', totalAccounts, 'Active:', activeAccounts);
                }
            }
        } catch (err) {
            console.error('[agenda appointmentReminder] Lỗi khi tìm accountKey:', err);
        }
        
        if (!accountKey) {
            throw new Error('Không có tài khoản Zalo để gửi tin. Vui lòng đăng nhập QR trong Zalo Hệ Thống.');
        }
        
        let response;
        try {
            const result = await sendUserMessage({
                accountKey: accountKey,
                userId: appointment.customer.uid?.[0]?.uid || '',
                text: reminderMessage,
                attachments: []
            });
            
            response = {
                status: result.ok || false,
                message: result.ok ? 'Gửi tin nhắn thành công' : (result.message || 'Gửi tin nhắn thất bại'),
                content: {
                    error_code: result.ok ? 0 : -1,
                    error_message: result.ok ? '' : (result.message || 'Gửi tin nhắn thất bại'),
                    data: result.ack || {}
                }
            };
        } catch (err) {
            console.error('[agenda appointmentReminder] Lỗi khi gửi tin nhắn:', err);
            response = { status: false, message: err?.message || 'Lỗi không xác định', content: { error_code: -1, error_message: err?.message || 'Lỗi không xác định', data: {} } };
        }

        await Logs.create({
            status: {
                status: response?.status || false,
                message: reminderMessage,
                data: {
                    error_code: response?.content?.error_code || null,
                    error_message: response?.content?.error_message || (response?.status ? '' : 'Invalid response from AppScript')
                }
            },
            type: 'sendMessage',
            createBy: SYSTEM_USER_ID,
            customer: customerId,
            zalo: zaloAccountId || null, // Sử dụng zaloAccountId từ ZaloAccountNew
        });
        if (!response?.status) throw new Error(response?.message || 'Gửi tin nhắn nhắc hẹn qua Zalo thất bại');

        // 5) Gửi bell thông báo hệ thống (đã cập nhật)
        const bellText =
            `🔔 NHẮC HẸN KHÁCH HÀNG\n` +
            `--------------------\n` +
            `👤 Tên: ${appointment.customer.name || ''}\n` +
            `📞 SĐT: ${appointment.customer.phone || ''}\n` +
            `🗓️ Thời gian: ${timeStr}\n` +
            ` K- Dịch vụ: ${appointmentTitle}\n` +// Thêm dòng dịch vụ
            `📝 Ghi chú: ${noteStr}\n` +
            `--------------------\n` +
            `Người tạo lịch: ${appointment.createdBy?.name || 'Hệ thống'}`;

        const bellOk = await sendGP(bellText);
        if (!bellOk) {
            await logCareHistory(customerId, jobName, 'success', 'Đã gửi Zalo; bell lỗi.');
        } else {
            await logCareHistory(customerId, jobName, 'success');
        }

    } catch (error) {
        console.error(`[Job ${jobName}] Xảy ra lỗi: "${error.message}"`);
        await logCareHistory(customerId, jobName, 'failed', error.message);
        if (RETRYABLE_ERRORS.includes(error.message) && job) {
            await handleJobFailure(job, error, job?.attrs?.data?.cwId, jobName);
        }
    }
}

// =============================================================
// == Processor mới: preSurgeryReminder
// =============================================================
async function preSurgeryReminderProcessor(job) {
    const { appointmentId, customerId } = job.attrs.data || {};
    const jobName = 'preSurgeryReminder';

    try {
        // 1. Lấy dữ liệu cần thiết, populate đầy đủ service và customer
        const appointment = await Appointment.findById(appointmentId)
            .populate({
                path: 'service',
                select: 'preSurgeryMessages', // Chỉ lấy trường cần thiết từ service
            })
            .populate('customer', 'name phone uid') // Lấy các trường cần thiết từ customer
            .lean();
        if (!appointment || !appointment.customer || !appointment.service) {
            console.log(appointment);
            throw new Error(`Không tìm thấy dữ liệu đầy đủ cho Appointment ID ${appointmentId}`);
        }

        // 2. Tìm đúng tin nhắn dặn dò cho liệu trình
        const preSurgeryMsgTemplate = appointment.service.preSurgeryMessages.find(
            msg => msg.appliesToCourse === appointment.treatmentCourse
        );

        if (!preSurgeryMsgTemplate || !preSurgeryMsgTemplate.content) {
            console.log(`[Job ${jobName}] Không tìm thấy tin nhắn dặn dò cho liệu trình "${appointment.treatmentCourse}". Bỏ qua.`);
            // Ghi log care để biết job đã chạy nhưng không có tin nhắn để gửi
            await logCareHistory(customerId, jobName, 'success', `Không tìm thấy mẫu tin nhắn dặn dò cho liệu trình "${appointment.treatmentCourse}".`);
            return;
        }

        // 3. Xử lý và gửi tin nhắn qua Zalo
        const messageContent = await processMessage(preSurgeryMsgTemplate.content, appointment.customer);

        // Sử dụng ZaloAccountNew (Zalo Hệ Thống) thay vì model Zalo cũ
        let accountKey = null;
        let zaloAccountId = null;
        
        try {
            await dbConnect(); // Đảm bảo kết nối DB
            
            // Ưu tiên 1: Tìm account từ customer.uid[0].zalo (nếu có và là ZaloAccountNew)
            if (appointment.customer.uid?.[0]?.zalo) {
                try {
                    const zaloAccount = await ZaloAccountNew.findById(appointment.customer.uid[0].zalo)
                        .select('accountKey status')
                        .lean();
                    
                    if (zaloAccount?.status === 'active' && zaloAccount?.accountKey) {
                        accountKey = zaloAccount.accountKey;
                        zaloAccountId = zaloAccount._id;
                        console.log('[agenda preSurgeryReminder] ✅ Tìm thấy account từ customer.uid:', accountKey);
                    }
                } catch (err) {
                    // Có thể là model Zalo cũ, bỏ qua và tìm account active
                    console.log('[agenda preSurgeryReminder] customer.uid[0].zalo không phải ZaloAccountNew, tìm account active');
                }
            }
            
            // Ưu tiên 2: Lấy account active đầu tiên từ ZaloAccountNew (Zalo Hệ Thống)
            if (!accountKey) {
                const fallbackAccount = await ZaloAccountNew.findOne({ 
                    status: 'active' 
                }).sort({ updatedAt: 1 }).select('accountKey _id status').lean();
                
                if (fallbackAccount?.accountKey) {
                    accountKey = fallbackAccount.accountKey;
                    zaloAccountId = fallbackAccount._id;
                    console.log('[agenda preSurgeryReminder] ✅ Sử dụng account active đầu tiên:', accountKey);
                } else {
                    // Kiểm tra xem có account nào trong hệ thống không
                    const totalAccounts = await ZaloAccountNew.countDocuments({});
                    const activeAccounts = await ZaloAccountNew.countDocuments({ status: 'active' });
                    console.error('[agenda preSurgeryReminder] ❌ Không tìm thấy account active. Tổng số account:', totalAccounts, 'Active:', activeAccounts);
                }
            }
        } catch (err) {
            console.error('[agenda preSurgeryReminder] Lỗi khi tìm accountKey:', err);
        }
        
        if (!accountKey) {
            throw new Error('Không có tài khoản Zalo để gửi tin. Vui lòng đăng nhập QR trong Zalo Hệ Thống.');
        }
        
        let response;
        try {
            const result = await sendUserMessage({
                accountKey: accountKey,
                userId: appointment.customer.uid?.[0]?.uid || '',
                text: messageContent,
                attachments: []
            });
            
            response = {
                status: result.ok || false,
                message: result.ok ? 'Gửi tin nhắn thành công' : (result.message || 'Gửi tin nhắn thất bại'),
                content: {
                    error_code: result.ok ? 0 : -1,
                    error_message: result.ok ? '' : (result.message || 'Gửi tin nhắn thất bại'),
                    data: result.ack || {}
                }
            };
        } catch (err) {
            console.error('[agenda preSurgeryReminder] Lỗi khi gửi tin nhắn:', err);
            response = { status: false, message: err?.message || 'Lỗi không xác định', content: { error_code: -1, error_message: err?.message || 'Lỗi không xác định', data: {} } };
        }

        // 4. Ghi log và lịch sử chăm sóc
        await Logs.create({
            status: {
                status: response?.status || false,
                message: messageContent,
                data: {
                    error_code: response?.content?.error_code || null,
                    error_message: response?.content?.error_message || (response?.status ? '' : 'Invalid response from zca-js')
                }
            },
            type: 'sendMessage',
            createBy: SYSTEM_USER_ID,
            customer: customerId,
            zalo: zaloAccountId || null, // Sử dụng zaloAccountId từ ZaloAccountNew
        });

        if (!response?.status) throw new Error(response?.message || 'Gửi tin nhắn dặn dò qua Zalo thất bại');

        await logCareHistory(customerId, jobName, 'success', `Gửi dặn dò: ${messageContent.substring(0, 100)}...`);

    } catch (error) {
        console.error(`[Job ${jobName}] Xảy ra lỗi: "${error.message}"`);
        await logCareHistory(customerId, jobName, 'failed', error.message);
    }
}

// =============================================================
// == Processor mới: postSurgeryMessage
// =============================================================
async function postSurgeryMessageProcessor(job) {
    const { customerId, appointmentId, messageContent } = job.attrs.data || {};
    const jobName = 'postSurgeryMessage';

    try {
        if (!customerId || !messageContent) {
            throw new Error(`Thiếu customerId hoặc messageContent trong job data.`);
        }

        const customer = await Customer.findById(customerId).lean();
        if (!customer) throw new Error(`Không tìm thấy Customer ID ${customerId}`);

        // Xử lý message (thay thế placeholder)
        const processedMessage = await processMessage(messageContent, customer);

        // Chọn tài khoản Zalo để gửi - Sử dụng ZaloAccountNew (Zalo Hệ Thống)
        let accountKey = null;
        let zaloAccountId = null;
        
        try {
            await dbConnect(); // Đảm bảo kết nối DB
            
            // Ưu tiên 1: Tìm account từ customer.uid[0].zalo (nếu có và là ZaloAccountNew)
            if (customer.uid?.[0]?.zalo) {
                try {
                    const zaloAccount = await ZaloAccountNew.findById(customer.uid[0].zalo)
                        .select('accountKey status')
                        .lean();
                    
                    if (zaloAccount?.status === 'active' && zaloAccount?.accountKey) {
                        accountKey = zaloAccount.accountKey;
                        zaloAccountId = zaloAccount._id;
                        console.log('[agenda postSurgeryMessage] ✅ Tìm thấy account từ customer.uid:', accountKey);
                    }
                } catch (err) {
                    // Có thể là model Zalo cũ, bỏ qua và tìm account active
                    console.log('[agenda postSurgeryMessage] customer.uid[0].zalo không phải ZaloAccountNew, tìm account active');
                }
            }
            
            // Ưu tiên 2: Lấy account active đầu tiên từ ZaloAccountNew (Zalo Hệ Thống)
            if (!accountKey) {
                const fallbackAccount = await ZaloAccountNew.findOne({ 
                    status: 'active' 
                }).sort({ updatedAt: 1 }).select('accountKey _id status').lean();
                
                if (fallbackAccount?.accountKey) {
                    accountKey = fallbackAccount.accountKey;
                    zaloAccountId = fallbackAccount._id;
                    console.log('[agenda postSurgeryMessage] ✅ Sử dụng account active đầu tiên:', accountKey);
                } else {
                    // Kiểm tra xem có account nào trong hệ thống không
                    const totalAccounts = await ZaloAccountNew.countDocuments({});
                    const activeAccounts = await ZaloAccountNew.countDocuments({ status: 'active' });
                    console.error('[agenda postSurgeryMessage] ❌ Không tìm thấy account active. Tổng số account:', totalAccounts, 'Active:', activeAccounts);
                }
            }
        } catch (err) {
            console.error('[agenda postSurgeryMessage] Lỗi khi tìm accountKey:', err);
        }
        
        if (!accountKey) {
            throw new Error('Không có tài khoản Zalo để gửi tin. Vui lòng đăng nhập QR trong Zalo Hệ Thống.');
        }
        
        // Gửi tin nhắn bằng zca-js
        let response;
        try {
            const result = await sendUserMessage({
                accountKey: accountKey,
                userId: customer.uid?.[0]?.uid || '',
                text: processedMessage,
                attachments: []
            });
            
            response = {
                status: result.ok || false,
                message: result.ok ? 'Gửi tin nhắn thành công' : (result.message || 'Gửi tin nhắn thất bại'),
                content: {
                    error_code: result.ok ? 0 : -1,
                    error_message: result.ok ? '' : (result.message || 'Gửi tin nhắn thất bại'),
                    data: result.ack || {}
                }
            };
        } catch (err) {
            console.error('[agenda postSurgeryMessage] Lỗi khi gửi tin nhắn:', err);
            response = { status: false, message: err?.message || 'Lỗi không xác định', content: { error_code: -1, error_message: err?.message || 'Lỗi không xác định', data: {} } };
        }

        // Ghi log
        await Logs.create({
            status: { 
                status: response?.status || false, 
                message: processedMessage, 
                data: {
                    error_code: response?.content?.error_code || null,
                    error_message: response?.content?.error_message || (response?.status ? '' : 'Invalid response from zca-js')
                }
            },
            type: 'sendMessage',
            createBy: SYSTEM_USER_ID,
            customer: customerId,
            zalo: zaloAccountId || null, // Sử dụng zaloAccountId từ ZaloAccountNew
        });

        if (!response?.status) throw new Error(response?.message || 'Gửi tin nhắn sau phẫu thuật thất bại');

        // Ghi lịch sử chăm sóc
        await logCareHistory(customerId, jobName, 'success', `Gửi tin nhắn sau PT: ${processedMessage.substring(0, 100)}...`);

    } catch (error) {
        console.error(`[Job ${jobName}] Xảy ra lỗi: "${error.message}"`);
        await logCareHistory(customerId, jobName, 'failed', error.message);
    }
}

// =============================================================
// == Processor mới: servicePreSurgeryMessage
// =============================================================
async function servicePreSurgeryMessageProcessor(job) {
    const { customerId, serviceDetailId, triggeredBy } = job.attrs.data || {};
    const jobName = 'servicePreSurgeryMessage';
    const jobId = job.attrs._id;

    console.log(`[Job ${jobName}] 🚀 Bắt đầu xử lý job. Job ID: ${jobId}, customerId: ${customerId}, serviceDetailId: ${serviceDetailId}, triggeredBy: ${triggeredBy}`);

    if (!customerId || !serviceDetailId) {
        console.error(`[Job ${jobName}] ❌ Thiếu customerId hoặc serviceDetailId. customerId: ${customerId}, serviceDetailId: ${serviceDetailId}`);
        await logCareHistory(customerId, jobName, 'failed', `Thiếu customerId hoặc serviceDetailId.`);
        return;
    }

    try {
        console.log(`[Job ${jobName}] 📋 Đang tìm customer và populate selectedService...`);
        
        // Populate selectedService để có đầy đủ thông tin
        const customer = await Customer.findById(customerId)
            .populate('serviceDetails.selectedService', 'name preSurgeryMessages')
            .lean();
        
        if (!customer) {
            console.error(`[Job ${jobName}] ❌ Không tìm thấy khách hàng ${customerId}`);
            await logCareHistory(customerId, jobName, 'failed', `Không tìm thấy khách hàng ${customerId}.`);
            return;
        }

        console.log(`[Job ${jobName}] ✅ Tìm thấy khách hàng: ${customer.name || customerId}`);

        let detail = null;
        if (Array.isArray(customer.serviceDetails)) {
            detail = customer.serviceDetails.find((d) => String(d?._id) === String(serviceDetailId));
        }

        if (!detail) {
            console.error(`[Job ${jobName}] ❌ Không tìm thấy đơn chốt ${serviceDetailId} trong ${customer.serviceDetails?.length || 0} đơn`);
            await logCareHistory(customerId, jobName, 'failed', `Không tìm thấy đơn chốt ${serviceDetailId}.`);
            return;
        }

        console.log(`[Job ${jobName}] ✅ Tìm thấy đơn chốt. approvalStatus: ${detail.approvalStatus}, selectedService: ${detail.selectedService ? (typeof detail.selectedService === 'object' ? detail.selectedService._id : detail.selectedService) : 'null'}, selectedCourse: ${detail.selectedCourse?.name || 'null'}`);

        // Cho phép gửi tin nhắn trước phẫu thuật ngay khi tạo đơn (không cần đợi duyệt)
        // Chỉ bỏ qua nếu đơn bị reject hoặc đã bị xóa
        if (detail.approvalStatus === 'rejected' || !detail.selectedService || !detail.selectedCourse) {
            console.log(`[Job ${jobName}] ⏭️ Đơn không đủ điều kiện. approvalStatus: ${detail.approvalStatus}, hasSelectedService: ${!!detail.selectedService}, hasSelectedCourse: ${!!detail.selectedCourse}`);
            await logCareHistory(customerId, jobName, 'success', `Đơn ${serviceDetailId} không đủ điều kiện để gửi tin nhắn trước phẫu thuật.`);
            return;
        }

        // detail đã là plain object từ .lean(), không cần toObject()
        const detailSnapshot = detail;
        const sessionStub = triggeredBy ? { id: triggeredBy } : { id: SYSTEM_USER_ID };
        
        // Tạo customer object để truyền vào hàm (cần là Mongoose document hoặc plain object)
        const customerForFunction = await Customer.findById(customerId);
        console.log(`[Job ${jobName}] 📤 Đang gọi sendPreSurgeryMessageIfNeeded...`);

        const result = await sendPreSurgeryMessageIfNeeded({
            customer: customerForFunction,
            detail: detailSnapshot,
            session: sessionStub,
        }).catch((error) => {
            console.error(`[Job ${jobName}] ❌ Lỗi khi gọi sendPreSurgeryMessageIfNeeded:`, error);
            console.error(`[Job ${jobName}] ❌ Error stack:`, error?.stack);
            return { error: error?.message || 'Unhandled error trong servicePreSurgeryMessageProcessor.' };
        });
        
        console.log(`[Job ${jobName}] 📥 Kết quả từ sendPreSurgeryMessageIfNeeded:`, JSON.stringify(result, null, 2));

        if (result?.success) {
            console.log(`[Job ${jobName}] ✅ Gửi tin nhắn trước phẫu thuật THÀNH CÔNG cho customerId: ${customerId}, serviceDetailId: ${serviceDetailId}`);
            await logCareHistory(customerId, jobName, 'success', 'Đã gửi tin nhắn trước phẫu thuật sau khi tạo đơn.');
            return;
        }

        if (result?.skipped) {
            console.log(`[Job ${jobName}] ⏭️ Bỏ qua gửi tin nhắn: ${result.skipped}`);
            await logCareHistory(customerId, jobName, 'success', result.skipped);
            return;
        }

        const errorMsg = result?.error || 'Không thể gửi tin nhắn trước phẫu thuật.';
        console.error(`[Job ${jobName}] ❌ Gửi tin nhắn trước phẫu thuật THẤT BẠI cho customerId: ${customerId}, serviceDetailId: ${serviceDetailId}. Lỗi: ${errorMsg}`);
        await logCareHistory(customerId, jobName, 'failed', errorMsg);
    } catch (error) {
        console.error(`[Job ${jobName}] ❌ Xảy ra lỗi không mong đợi: "${error.message}"`);
        console.error(`[Job ${jobName}] ❌ Error stack:`, error?.stack);
        await logCareHistory(customerId, jobName, 'failed', error.message);
    }
}

// =============================================================
// == 4.5. PROCESSOR CHO AUTO MESSAGE CUSTOMER
// =============================================================
/**
 * Job processor để tự động quét tin nhắn và tạo khách hàng
 */
async function autoMessageCustomerProcessor(job) {
    const startTime = Date.now();
    
    try {
        // Lấy danh sách pages
        const pages = await getPagesFromAPI();
        if (!pages || !Array.isArray(pages) || pages.length === 0) {
            console.warn('[AutoMessageCustomer] ⚠️ Không tìm thấy pages nào');
            return;
        }

        const PANCAKE_API_URL = 'https://pancake.vn/api/v1/conversations';
        let totalCreated = 0;
        let totalProcessed = 0;

        // Xử lý từng page
        for (const page of pages) {
            try {
                // Lấy conversations từ Pancake API cho page này
                // Thử cả unread_first và không có unread_first để lấy tất cả conversations mới nhất
                const pancakeApiUrl = new URL(PANCAKE_API_URL);
                const params = new URLSearchParams({
                    mode: 'NONE',
                    tags: '"ALL"',
                    except_tags: '[]',
                    access_token: page.accessToken,
                    cursor_mode: 'true',
                    from_platform: 'web',
                    limit: '50', // Lấy 50 conversations mới nhất
                });
                params.append(`pages[${page.id}]`, '0');
                pancakeApiUrl.search = params.toString();

                const response = await fetch(pancakeApiUrl.toString(), { cache: 'no-store' });
                if (!response.ok) {
                    const errorText = await response.text().catch(() => '');
                    console.error(`[AutoMessageCustomer] ❌ Lỗi khi lấy conversations cho page ${page.id}: ${response.status} - ${errorText.substring(0, 200)}`);
                    continue;
                }

                const conversationData = await response.json();
                const conversations = Array.isArray(conversationData?.conversations) 
                    ? conversationData.conversations 
                    : [];

                

                // Xử lý từng conversation có cập nhật gần đây
                for (const conv of conversations) {
                    try {
                        const convUpdatedAt = conv.updated_at ? new Date(conv.updated_at) : null;
                        const now = new Date();
                        const tenMinutesAgo = new Date(now.getTime() - 10 * 60 * 1000);
                        const thirtyMinutesAgo = new Date(now.getTime() - 30 * 60 * 1000); // Mở rộng thời gian lên 30 phút
                        
                        

                        // Xử lý nếu:
                        // 1. Có unread_count > 0 HOẶC
                        // 2. Có updated_at trong 30 phút gần đây
                        const hasUnread = conv.unread_count > 0;
                        const isRecent = convUpdatedAt && convUpdatedAt > thirtyMinutesAgo;
                        
                        if (!hasUnread && !isRecent) {
                            continue;
                        }

                        totalProcessed++;
                        

                        // Xử lý conversation với page info (bao gồm accessToken)
                        const pageInfo = {
                            ...page,
                            accessToken: page.accessToken
                        };

                        const result = await processMessageConversation(conv, pageInfo);
                        if (result.success) {
                            totalCreated++;
                        } else {
                            
                        }
                    } catch (convError) {
                        console.error(`[AutoMessageCustomer] ❌ Lỗi khi xử lý conversation ${conv.id}:`, convError?.message);
                    }
                }
            } catch (pageError) {
                console.error(`[AutoMessageCustomer] ❌ Lỗi khi xử lý page ${page.id}:`, pageError?.message);
            }
        }

        const duration = ((Date.now() - startTime) / 1000).toFixed(2);
        
    } catch (error) {
        console.error('[AutoMessageCustomer] ❌ Lỗi nghiêm trọng:', error);
        throw error;
    }
}

// =============================================================
// == 5. HÀM KHỞI TẠO AGENDA
// =============================================================
/**
 * Khởi tạo và cấu hình instance của Agenda (singleton pattern).
 * @returns {Promise<Agenda>} Instance của Agenda đã được khởi động.
 */
const initAgenda = async () => {
    if (agendaInstance) return agendaInstance;

    const mongoConnectionString = process.env.MONGODB_URI;
    agendaInstance = new Agenda({
        db: { address: mongoConnectionString },
        collection: 'agendaJobs', processEvery: '20 seconds',
        maxConcurrency: 50, defaultConcurrency: 10, lockLifetime: 10000,
    });

    // Định nghĩa tất cả các job
    agendaInstance.define('message', { priority: 'high', concurrency: 10 }, genericJobProcessor);
    agendaInstance.define('friendRequest', genericJobProcessor);
    agendaInstance.define('checkFriend', genericJobProcessor);
    agendaInstance.define('tag', genericJobProcessor);
    agendaInstance.define('findUid', genericJobProcessor);
    agendaInstance.define('allocation', { concurrency: 10 }, allocationJobProcessor);
    agendaInstance.define('bell', { concurrency: 10 }, bellJobProcessor);
    agendaInstance.define('appointmentReminder', { priority: 'high', concurrency: 10 }, appointmentReminderProcessor);
    agendaInstance.define('preSurgeryReminder', { priority: 'normal', concurrency: 10 }, preSurgeryReminderProcessor);
    agendaInstance.define('postSurgeryMessage', { priority: 'high', concurrency: 10 }, postSurgeryMessageProcessor);
    agendaInstance.define('servicePreSurgeryMessage', { priority: 'high', concurrency: 10 }, servicePreSurgeryMessageProcessor);
    agendaInstance.define('autoMessageCustomer', { priority: 'normal', concurrency: 1 }, autoMessageCustomerProcessor);
    
    agendaInstance.on('fail', (err, job) => {
        console.error(`[Agenda fail] Job ${job.attrs.name} thất bại: ${err.message}`);
    });

    await agendaInstance.start();
    console.log('[initAgenda] Agenda đã khởi động thành công.');
    
    // Schedule job tự động quét tin nhắn mỗi 30 giây
    try {
        // Kiểm tra xem job đã được schedule chưa
        const existingJobs = await agendaInstance.jobs({ name: 'autoMessageCustomer', type: 'single' });
        if (existingJobs.length === 0) {
            await agendaInstance.every('30 seconds', 'autoMessageCustomer', {}, { 
                timezone: 'Asia/Ho_Chi_Minh',
                skipImmediate: false // Chạy ngay lần đầu
            });
            console.log('[initAgenda] ✅ Đã schedule job autoMessageCustomer chạy mỗi 30 giây.');
        } else {
            console.log('[initAgenda] ℹ️ Job autoMessageCustomer đã được schedule.');
        }
    } catch (scheduleError) {
        console.error('[initAgenda] ❌ Lỗi khi schedule job autoMessageCustomer:', scheduleError?.message || scheduleError);
    }
    
    return agendaInstance;
};

export default initAgenda;