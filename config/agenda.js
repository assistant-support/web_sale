'use server';

import Agenda from 'agenda';
import mongoose from 'mongoose';
import { CustomerWorkflow, WorkflowTemplate } from '@/models/workflow.model';
import Customer from '@/models/customer.model';
import Zalo from '@/models/zalo.model';
import Logs from '@/models/log.model';
import Setting from '@/models/setting.model';
import Form from '@/models/formclient';
import Variant from '@/models/variant.model';
import Service from '@/models/services.model';
import User from '@/models/users';
import { actionZalo, sendGP } from '@/function/drive/appscript';

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
    allocation: 3, bell: 3,
};
const actionToNameMap = {
    message: 'Gửi tin nhắn Zalo', friendRequest: 'Gửi lời mời kết bạn',
    checkFriend: 'Kiểm tra trạng thái bạn bè', tag: 'Gắn thẻ Zalo',
    findUid: 'Tìm UID Zalo', allocation: 'Phân bổ cho Sale', bell: 'Gửi thông báo hệ thống',
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
            if (customer.uid?.[0]?.zalo) selectedZalo = await Zalo.findById(customer.uid[0].zalo);
            if (!selectedZalo) selectedZalo = await Zalo.findOne();
            if (!selectedZalo) throw new Error('No Zalo account available for this action');
        }

        const uid = selectedZalo.uid;
        const zaloId = selectedZalo._id;
        const actionType = actionMap[jobName];
        const response = await actionZalo({ phone: customer.phone, uidPerson: customer.uid?.[0]?.uid || '', actionType, message: processedMessage, uid });

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
                    customer.uid[0].isFriend = response.content?.isFriend ? 1 : 0;
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
                await Customer.updateOne({ _id: customerId }, {
                    $set: {
                        'pipelineStatus.0': newStatus,
                        'pipelineStatus.2': newStatus
                    }
                });
                triggerRevalidation();
                break;
            case 'findUid':
                await Zalo.updateOne({ _id: zaloId }, { $inc: { rateLimitPerHour: -1, rateLimitPerDay: -1 } });
                const foundUid = response.content?.data?.uid;
                if (foundUid) {
                    customer.uid = [{ zalo: zaloId, uid: normalizeUid(foundUid), isFriend: 0, isReques: 0 }];
                    customer.zaloavt = response.content?.data?.avatar || null;
                    customer.zaloname = response.content?.data?.zalo_name || null;
                    customer.pipelineStatus[0] = 'valid_1';
                    customer.pipelineStatus[1] = 'valid_1';
                    await customer.save();
                    triggerRevalidation();
                } else {
                    customer.pipelineStatus[0] = 'valid_1';
                    customer.pipelineStatus[1] = 'valid_1';
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
 * Tìm tài khoản Zalo tiếp theo có sẵn để thực hiện hành động, theo cơ chế round-robin.
 * @returns {Promise<{account: object|null, reason: string|null}>} Tài khoản Zalo hoặc lý do không có.
 */
async function findNextAvailableZaloAccount() {
    const ZALO_ROTATION_KEY = "lastUsedZaloIndex";
    const allAccounts = await Zalo.find({}).sort({ _id: 1 }).lean();
    if (allAccounts.length === 0) return { account: null, reason: 'no_accounts' };
    const lastIndexSetting = await Setting.findOne({ key: ZALO_ROTATION_KEY });
    let lastIndex = lastIndexSetting ? Number(lastIndexSetting.value) : -1;
    for (let i = 0; i < allAccounts.length; i++) {
        lastIndex = (lastIndex + 1) % allAccounts.length;
        const selectedAccount = allAccounts[lastIndex];
        if (selectedAccount.rateLimitPerHour > 0 && selectedAccount.rateLimitPerDay > 0) {
            await Setting.updateOne({ key: ZALO_ROTATION_KEY }, { $set: { value: lastIndex } }, { upsert: true });
            return { account: selectedAccount, reason: null };
        }
    }
    return { account: null, reason: allAccounts.some(acc => acc.rateLimitPerDay > 0) ? 'hourly' : 'daily' };
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

    agendaInstance.on('fail', (err, job) => {
        console.error(`[Agenda fail] Job ${job.attrs.name} thất bại: ${err.message}`);
    });

    await agendaInstance.start();
    console.log('[initAgenda] Agenda đã khởi động thành công.');
    return agendaInstance;
};

export default initAgenda;