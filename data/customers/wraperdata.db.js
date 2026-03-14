'use server';

import { revalidateTag } from 'next/cache';
import mongoose from 'mongoose';
import Customer from '@/models/customer.model';
import Service from '@/models/services.model';
import ServiceDetail from '@/models/service_details.model';
import Order from '@/models/orders.model';
import ReportDaily from '@/models/report_daily.model';
import Logs from '@/models/log.model';
import Zalo from '@/models/zalo.model';
import { ZaloAccount as ZaloAccountNew } from '@/models/zalo-account.model';
import { uploadFileToDrive } from '@/function/drive/image';
import {
    rebuildFinancialReportForMonth,
    rebuildFinancialReportDailyForDateRange,
} from '@/data/financial/financialReports.db';
import { findUserUid, sendUserMessage } from '@/data/zalo/chat.actions';
import checkAuthToken from '@/utils/checktoken';
import connectDB from '@/config/connectDB';

// Helper function để đảm bảo kết nối MongoDB
async function ensureMongo() {
    try {
        await connectDB();
    } catch (err) {
        console.error('[ensureMongo] MongoDB connection error:', err?.message);
        throw err;
    }
}
import { getCustomersAll } from '@/data/customers/handledata.db';
import { revalidateData } from '@/app/actions/customer.actions';
import { validatePipelineStatusUpdate } from '@/utils/pipelineStatus';

/* ============================================================
 * Helpers
 * ============================================================ */
const isValidObjectId = (id) => mongoose.Types.ObjectId.isValid(String(id));
const allowedServiceStatus = new Set(['new', 'in_progress', 'completed']);

function pipelineFromServiceStatus(st) {
    return st === 'completed' ? 'serviced_completed_6' : 'serviced_in_progress_6';
}


async function pushCareLog(customerId, content, userId, step = 6) {
    await Customer.updateOne(
        { _id: customerId },
        {
            $push: {
                care: { content, step, createBy: userId, createAt: new Date() },
            },
        }
    );
}

/**
 * Rebuild service_use từ serviceDetails (nguồn đúng theo SuaDonDichVu.md).
 * Chỉ lấy đơn không bị từ chối (status !== 'rejected').
 */
async function rebuildServiceUseForCustomer(customerId) {
    const customer = await Customer.findById(customerId).select('serviceDetails').lean();
    if (!customer || !Array.isArray(customer.serviceDetails)) {
        await Customer.updateOne({ _id: customerId }, { $set: { service_use: [] } });
        return;
    }
    const seen = new Set();
    const serviceIds = [];
    for (const sd of customer.serviceDetails) {
        if (sd.status === 'rejected') continue;
        const raw = sd.serviceId ?? sd.selectedService;
        if (!raw) continue;
        const idStr = typeof raw === 'object' && raw !== null ? String(raw._id ?? raw.$oid ?? raw) : String(raw);
        if (idStr && isValidObjectId(idStr) && !seen.has(idStr)) {
            seen.add(idStr);
            serviceIds.push(new mongoose.Types.ObjectId(idStr));
        }
    }
    await Customer.updateOne({ _id: customerId }, { $set: { service_use: serviceIds } });
}

/**
 * Rebuild history_service từ serviceDetails.
 * Structure (per history_service.md): { "Service Name": ["Course 1", "Course 2", ...] }
 * Skips incomplete records (missing serviceName or courseName); deduplicates courses per service.
 */
async function rebuildHistoryServiceForCustomer(customerId) {
    const customer = await Customer.findById(customerId).select('serviceDetails').lean();
    if (!customer || !Array.isArray(customer.serviceDetails) || customer.serviceDetails.length === 0) {
        await Customer.updateOne({ _id: customerId }, { $set: { history_service: {} } });
        return;
    }
    const serviceIds = new Set();
    customer.serviceDetails.forEach((sd) => {
        const raw = sd.serviceId ?? sd.selectedService;
        if (!raw) return;
        const idStr = typeof raw === 'object' && raw !== null ? String(raw._id ?? raw.$oid ?? raw) : String(raw);
        if (idStr && isValidObjectId(idStr)) serviceIds.add(idStr);
    });
    const services = await Service.find({ _id: { $in: Array.from(serviceIds).map((id) => new mongoose.Types.ObjectId(id)) } })
        .select('name')
        .lean();
    const serviceMap = new Map(services.map((s) => [String(s._id), (s.name || '').trim()]));
    const grouped = {};
    customer.serviceDetails.forEach((detail) => {
        const raw = detail.serviceId ?? detail.selectedService;
        const serviceIdStr = raw != null ? (typeof raw === 'object' ? String(raw._id ?? raw.$oid ?? raw) : String(raw)) : null;
        if (!serviceIdStr) return;
        const serviceName = serviceMap.get(serviceIdStr) || (detail.selectedService?.name || '').trim();
        const courseName = (detail.selectedCourse?.name || '').trim();
        if (!serviceName || !courseName) return;
        if (!grouped[serviceName]) grouped[serviceName] = new Set();
        grouped[serviceName].add(courseName);
    });
    const history = {};
    Object.keys(grouped).forEach((serviceName) => {
        history[serviceName] = Array.from(grouped[serviceName]);
    });
    await Customer.updateOne({ _id: customerId }, { $set: { history_service: history } });
}

const toStringId = (value) => {
    if (!value) return null;
    if (typeof value === 'string') return value;
    if (typeof value === 'object' && typeof value.toString === 'function') return value.toString();
    return null;
};

async function loadPreSurgeryMessageTemplate(serviceId, courseName) {
    if (!serviceId || !courseName) return null;
    const doc = await Service.findById(serviceId).select('name preSurgeryMessages').lean();
    if (!doc) return null;
    const matched = (doc.preSurgeryMessages || []).find(
        (msg) => msg?.appliesToCourse === courseName && typeof msg?.content === 'string' && msg.content.trim().length > 0
    );
    if (!matched) return null;
    return {
        serviceName: doc.name || '',
        courseName,
        content: matched.content.trim(),
    };
}

async function pickZaloAccountForCustomer(customerData, session) {
    // Sử dụng ZaloAccountNew (Zalo Hệ Thống) thay vì model Zalo cũ
    const uidEntries = Array.isArray(customerData?.uid) ? customerData.uid : [];
    for (const entry of uidEntries) {
        const zaloId = toStringId(entry?.zalo);
        if (!zaloId) continue;
        
        // Thử tìm trong ZaloAccountNew trước
        try {
            const zaloAccount = await ZaloAccountNew.findById(zaloId)
                .select('accountKey status profile')
                .lean();
            if (zaloAccount && zaloAccount.status === 'active') {
                return {
                    zalo: {
                        _id: zaloAccount._id,
                        uid: zaloAccount.accountKey,
                        accountKey: zaloAccount.accountKey,
                        profile: zaloAccount.profile
                    },
                    existingUid: entry?.uid ? String(entry.uid).trim() : null,
                    entry,
                };
            }
        } catch (err) {
            // Có thể là model Zalo cũ, bỏ qua
        }
    }

    // Fallback: Lấy account active đầu tiên từ ZaloAccountNew
    try {
        const fallbackAccount = await ZaloAccountNew.findOne({ 
            status: 'active' 
        }).sort({ updatedAt: 1 })
        .select('accountKey _id status profile')
        .lean();
        
        if (fallbackAccount) {
            return { 
                zalo: {
                    _id: fallbackAccount._id,
                    uid: fallbackAccount.accountKey,
                    accountKey: fallbackAccount.accountKey,
                    profile: fallbackAccount.profile
                }, 
                existingUid: null, 
                entry: null 
            };
        }
    } catch (err) {
        console.error('[pickZaloAccountForCustomer] Lỗi khi tìm fallback account:', err);
    }

    return null;
}

async function resolveCustomerUidForZalo(customerData, zaloInfo, phone) {
    const customerId = customerData?._id;
    if (!customerId) {
        return { error: 'Không xác định được khách hàng.' };
    }
    if (!phone) {
        return { error: 'Thiếu số điện thoại khách hàng.' };
    }
    const targetZaloId = toStringId(zaloInfo?.zalo?._id);
    if (!targetZaloId) {
        return { error: 'Không xác định được tài khoản Zalo.' };
    }

    const uidEntries = Array.isArray(customerData?.uid) ? customerData.uid : [];
    const existingEntry = uidEntries.find(
        (entry) => toStringId(entry?.zalo) === targetZaloId
    );

    if (existingEntry?.uid) {
        return { uid: String(existingEntry.uid).trim(), findUidResult: null };
    }

    // Lấy accountKey từ ZaloAccount mới - đơn giản hóa: lấy account active đầu tiên
    let accountKey = null;
    try {
        await ensureMongo();
        
        // Ưu tiên 1: Sử dụng accountKey từ zaloInfo nếu có (đã được lấy từ pickZaloAccountForCustomer)
        if (zaloInfo.zalo?.accountKey) {
            accountKey = zaloInfo.zalo.accountKey;
            console.log('[resolveCustomerUidForZalo] ✅ Sử dụng accountKey từ zaloInfo:', accountKey);
        } else if (zaloInfo.zalo?._id) {
            // Ưu tiên 2: Tìm bằng _id nếu có
            const zaloAccount = await ZaloAccountNew.findById(zaloInfo.zalo._id)
                .select('accountKey status')
                .lean();
            
            if (zaloAccount?.status === 'active' && zaloAccount?.accountKey) {
                accountKey = zaloAccount.accountKey;
                console.log('[resolveCustomerUidForZalo] ✅ Tìm thấy accountKey từ _id:', accountKey);
            }
        }
        
            // Ưu tiên 3: Nếu vẫn không tìm thấy, lấy account đầu tiên có status active (cũ nhất)
            if (!accountKey) {
                const fallbackAccount = await ZaloAccountNew.findOne({ 
                    status: 'active' 
                }).sort({ updatedAt: 1 }).lean(); // 1 = ascending (cũ nhất trước)
            
            if (fallbackAccount?.accountKey) {
                accountKey = fallbackAccount.accountKey;
                console.warn('[resolveCustomerUidForZalo] Không tìm thấy ZaloAccount tương ứng, sử dụng fallback account:', accountKey);
            }
        }
    } catch (err) {
        console.error('[resolveCustomerUidForZalo] Lỗi khi tìm accountKey:', err);
        return { error: `Lỗi khi tìm tài khoản Zalo: ${err?.message || 'Unknown error'}` };
    }

    if (!accountKey) {
        console.error('[resolveCustomerUidForZalo] ❌ Không tìm thấy accountKey hợp lệ');
        return { error: 'Không tìm thấy tài khoản Zalo hợp lệ trong hệ thống mới. Vui lòng đăng nhập QR trước.' };
    }
    
    console.log('[resolveCustomerUidForZalo] ✅ Sử dụng accountKey:', accountKey, 'để tìm UID cho số điện thoại:', phone);

    // Sử dụng findUserUid từ zca-js thay vì appscripts
    console.log('[resolveCustomerUidForZalo] 🔍 Đang tìm UID với accountKey:', accountKey, 'phone:', phone);
    
    let findUidResult;
    try {
        findUidResult = await findUserUid({
            accountKey: accountKey,
            phoneOrUid: phone
        });
        
        console.log('[resolveCustomerUidForZalo] 📥 Kết quả findUserUid:', {
            ok: findUidResult?.ok,
            uid: findUidResult?.uid,
            message: findUidResult?.message,
            code: findUidResult?.code
        });
    } catch (err) {
        console.error('[resolveCustomerUidForZalo] ❌ Lỗi khi gọi findUserUid:', err);
        return { error: `Lỗi khi tìm UID: ${err?.message || 'Unknown error'}`, findUidResult: null };
    }

    if (!findUidResult?.ok || !findUidResult?.uid) {
        const errorMessage = findUidResult?.message || 'Không tìm thấy UID Zalo của khách hàng.';
        console.error('[resolveCustomerUidForZalo] ❌ Tìm UID thất bại:', errorMessage);
        return { error: errorMessage, findUidResult };
    }
    
    console.log('[resolveCustomerUidForZalo] ✅ Tìm UID thành công:', findUidResult.uid);

    const normalizedUid = String(findUidResult.uid).trim();
    if (!normalizedUid) {
        return { error: 'UID trả về từ zca-js bị trống.', findUidResult };
    }

    // Format findUidResult để tương thích với code cũ
    const formattedResult = {
        status: true,
        content: {
            error_code: 0,
            error_message: '',
            data: {
                uid: normalizedUid,
                avatar: findUidResult.avatar || '',
                zalo_name: findUidResult.displayName || '',
                display_name: findUidResult.displayName || ''
            }
        }
    };

    if (existingEntry) {
        await Customer.updateOne(
            { _id: customerId, 'uid.zalo': existingEntry.zalo },
            {
                $set: {
                    'uid.$.uid': normalizedUid,
                    'uid.$.isFriend': 0,
                    'uid.$.isReques': 0,
                    zaloavt: findUidResult.avatar || customerData.zaloavt || null,
                    zaloname: findUidResult.displayName || customerData.zaloname || null,
                },
            }
        );
    } else {
        await Customer.updateOne(
            { _id: customerId },
            {
                $push: {
                    uid: {
                        zalo: zaloInfo.zalo._id,
                        uid: normalizedUid,
                        isFriend: 0,
                        isReques: 0,
                    },
                },
                $set: {
                    zaloavt: findUidResult.avatar || customerData.zaloavt || null,
                    zaloname: findUidResult.displayName || customerData.zaloname || null,
                },
            }
        );
    }

    return { uid: normalizedUid, findUidResult: formattedResult };
}

export async function sendPreSurgeryMessageIfNeeded({ customer, detail, session }) {
    console.log('[sendPreSurgeryMessageIfNeeded] 🚀 Bắt đầu xử lý gửi tin nhắn trước phẫu thuật');
    
    const customerData = customer?.toObject ? customer.toObject() : customer;
    if (!customerData?._id || !detail) {
        console.error('[sendPreSurgeryMessageIfNeeded] ❌ Thiếu dữ liệu khách hàng hoặc đơn dịch vụ. customerData._id:', customerData?._id, 'detail:', !!detail);
        return { skipped: 'Thiếu dữ liệu khách hàng hoặc đơn dịch vụ.' };
    }

    console.log(`[sendPreSurgeryMessageIfNeeded] 📋 Customer ID: ${customerData._id}, Customer name: ${customerData.name || 'N/A'}`);

    const selectedServiceId = detail?.selectedService?._id
        ? detail.selectedService._id
        : detail?.selectedService;
    const courseName = detail?.selectedCourse?.name || '';

    console.log(`[sendPreSurgeryMessageIfNeeded] 📋 selectedServiceId: ${selectedServiceId}, courseName: ${courseName}`);

    if (!selectedServiceId || !courseName) {
        console.error('[sendPreSurgeryMessageIfNeeded] ❌ Đơn không có thông tin dịch vụ hoặc liệu trình');
        return { skipped: 'Đơn không có thông tin dịch vụ hoặc liệu trình.' };
    }

    console.log(`[sendPreSurgeryMessageIfNeeded] 🔍 Đang tìm template tin nhắn cho serviceId: ${selectedServiceId}, courseName: ${courseName}`);
    const template = await loadPreSurgeryMessageTemplate(selectedServiceId, courseName);
    if (!template) {
        console.error(`[sendPreSurgeryMessageIfNeeded] ❌ Không tìm thấy template tin nhắn cho serviceId: ${selectedServiceId}, courseName: ${courseName}`);
        return { skipped: 'Không tìm thấy nội dung tin nhắn trước phẫu thuật phù hợp.' };
    }

    console.log(`[sendPreSurgeryMessageIfNeeded] ✅ Tìm thấy template. serviceName: ${template.serviceName}, courseName: ${template.courseName}, content length: ${template.content?.length || 0}`);

    const phone = String(customerData.phone || '').trim();
    if (!phone) {
        console.error(`[sendPreSurgeryMessageIfNeeded] ❌ Thiếu số điện thoại khách hàng. Customer ID: ${customerData._id}`);
        await pushCareLog(
            customerData._id,
            `[Auto] Không thể gửi tin nhắn trước phẫu thuật cho dịch vụ ${template.serviceName}${courseName ? ` (${courseName})` : ''} vì thiếu số điện thoại.`,
            session?.id
        );
        return { error: 'Thiếu số điện thoại khách hàng.' };
    }

    console.log(`[sendPreSurgeryMessageIfNeeded] 📞 Số điện thoại khách hàng: ${phone}`);

    console.log(`[sendPreSurgeryMessageIfNeeded] 🔍 Đang tìm tài khoản Zalo cho khách hàng...`);
    const zaloInfo = await pickZaloAccountForCustomer(customerData, session);
    if (!zaloInfo?.zalo) {
        console.error(`[sendPreSurgeryMessageIfNeeded] ❌ Không tìm thấy tài khoản Zalo khả dụng cho customerId: ${customerData._id}`);
        await pushCareLog(
            customerData._id,
            `[Auto] Không thể gửi tin nhắn trước phẫu thuật cho dịch vụ ${template.serviceName}${courseName ? ` (${courseName})` : ''} vì không có tài khoản Zalo khả dụng.`,
            session?.id
        );
        return { error: 'Không tìm thấy tài khoản Zalo khả dụng.' };
    }

    console.log(`[sendPreSurgeryMessageIfNeeded] ✅ Tìm thấy tài khoản Zalo. Zalo ID: ${zaloInfo.zalo._id}, accountKey: ${zaloInfo.zalo.accountKey || 'N/A'}, existingUid: ${zaloInfo.existingUid || 'N/A'}`);

    let uidPerson = zaloInfo.existingUid;
    if (!uidPerson) {
        console.log(`[sendPreSurgeryMessageIfNeeded] 🔍 Không có UID sẵn có, đang tìm UID từ số điện thoại...`);
        const uidResult = await resolveCustomerUidForZalo(customerData, zaloInfo, phone);
        if (uidResult?.error) {
            console.error(`[sendPreSurgeryMessageIfNeeded] ❌ Lỗi khi tìm UID: ${uidResult.error}`);
            await pushCareLog(
                customerData._id,
                `[Auto] Không thể gửi tin nhắn trước phẫu thuật cho dịch vụ ${template.serviceName}${courseName ? ` (${courseName})` : ''}: ${uidResult.error}`,
                session?.id
            );
            return { error: uidResult.error };
        }
        uidPerson = uidResult.uid;
        console.log(`[sendPreSurgeryMessageIfNeeded] ✅ Tìm thấy UID: ${uidPerson}`);
    } else {
        console.log(`[sendPreSurgeryMessageIfNeeded] ✅ Sử dụng UID sẵn có: ${uidPerson}`);
    }

    if (!uidPerson) {
        const msg = 'Không có UID Zalo của khách hàng.';
        console.error(`[sendPreSurgeryMessageIfNeeded] ❌ ${msg}`);
        await pushCareLog(
            customerData._id,
            `[Auto] Không thể gửi tin nhắn trước phẫu thuật cho dịch vụ ${template.serviceName}${courseName ? ` (${courseName})` : ''}: ${msg}`,
            session?.id
        );
        return { error: msg };
    }

    const messageContent = template.content;
    
    // Lấy accountKey từ ZaloAccountNew (Zalo Hệ Thống)
    let accountKey = null;
    try {
        await ensureMongo(); // Đảm bảo kết nối DB
        
        // Ưu tiên: Sử dụng accountKey từ zaloInfo (đã được lấy từ pickZaloAccountForCustomer)
        if (zaloInfo.zalo?.accountKey) {
            accountKey = zaloInfo.zalo.accountKey;
            console.log('[sendPreSurgeryMessageIfNeeded] ✅ Sử dụng accountKey từ zaloInfo:', accountKey);
        } else if (zaloInfo.zalo?._id) {
            // Nếu có _id nhưng chưa có accountKey, tìm lại
            const zaloAccount = await ZaloAccountNew.findById(zaloInfo.zalo._id)
                .select('accountKey status')
                .lean();
            
            if (zaloAccount?.status === 'active' && zaloAccount?.accountKey) {
                accountKey = zaloAccount.accountKey;
                console.log('[sendPreSurgeryMessageIfNeeded] ✅ Tìm thấy accountKey từ _id:', accountKey);
            }
        }
        
        // Fallback: Lấy account active đầu tiên nếu không tìm thấy
        if (!accountKey) {
            const fallbackAccount = await ZaloAccountNew.findOne({ 
                status: 'active' 
            }).sort({ updatedAt: 1 })
            .select('accountKey _id status')
            .lean();
            
            if (fallbackAccount?.accountKey) {
                accountKey = fallbackAccount.accountKey;
                console.log('[sendPreSurgeryMessageIfNeeded] ✅ Sử dụng account active đầu tiên:', accountKey);
            } else {
                // Kiểm tra xem có account nào trong hệ thống không
                const totalAccounts = await ZaloAccountNew.countDocuments({});
                const activeAccounts = await ZaloAccountNew.countDocuments({ status: 'active' });
                console.error('[sendPreSurgeryMessageIfNeeded] ❌ Không tìm thấy account active. Tổng số account:', totalAccounts, 'Active:', activeAccounts);
            }
        }
    } catch (err) {
        console.error('[sendPreSurgeryMessageIfNeeded] Lỗi khi tìm accountKey:', err);
    }
    
    if (!accountKey) {
        const msg = 'Không tìm thấy tài khoản Zalo hợp lệ. Vui lòng đăng nhập QR trong Zalo Hệ Thống.';
        await pushCareLog(
            customerData._id,
            `[Auto] Không thể gửi tin nhắn trước phẫu thuật cho dịch vụ ${template.serviceName}${courseName ? ` (${courseName})` : ''}: ${msg}`,
            session?.id
        );
        return { error: msg };
    }
    
    // Gửi tin nhắn bằng zca-js
    console.log(`[sendPreSurgeryMessageIfNeeded] 📤 Đang gửi tin nhắn. accountKey: ${accountKey}, userId: ${uidPerson}, message length: ${messageContent.length}`);
    let sendResult;
    try {
        const result = await sendUserMessage({
            accountKey: accountKey,
            userId: uidPerson,
            text: messageContent,
            attachments: []
        });
        
        console.log(`[sendPreSurgeryMessageIfNeeded] 📥 Kết quả từ sendUserMessage:`, {
            ok: result.ok,
            message: result.message,
            msgId: result.msgId,
            hasAck: !!result.ack
        });
        
        // Format result để tương thích với code cũ
        sendResult = {
            status: result.ok || false,
            content: {
                error_code: result.ok ? 0 : -1,
                error_message: result.ok ? '' : (result.message || 'Gửi tin nhắn thất bại'),
                data: result.ack || {}
            }
        };
        
        if (sendResult.status) {
            console.log(`[sendPreSurgeryMessageIfNeeded] ✅ Gửi tin nhắn THÀNH CÔNG! msgId: ${result.msgId || 'N/A'}`);
        } else {
            console.error(`[sendPreSurgeryMessageIfNeeded] ❌ Gửi tin nhắn THẤT BẠI! Lỗi: ${sendResult.content.error_message}`);
        }
    } catch (err) {
        console.error('[sendPreSurgeryMessageIfNeeded] ❌ Lỗi khi gửi tin nhắn:', err);
        console.error('[sendPreSurgeryMessageIfNeeded] ❌ Error stack:', err?.stack);
        sendResult = {
            status: false,
            content: {
                error_code: -1,
                error_message: err?.message || 'Lỗi không xác định',
                data: {}
            }
        };
    }

    // Lấy createBy từ session hoặc detail, không còn dùng zaloInfo.zalo.roles (model Zalo cũ)
    const logCreateBy =
        session?.id ||
        detail?.approvedBy ||
        detail?.closedBy ||
        null;

    if (logCreateBy) {
        await Logs.create({
            status: {
                status: sendResult?.status || false,
                message: messageContent,
                data: {
                    error_code: sendResult?.content?.error_code || null,
                    error_message:
                        sendResult?.content?.error_message ||
                        (sendResult?.status ? '' : sendResult?.message || 'Gửi tin nhắn thất bại'),
                },
            },
            type: 'sendMessage',
            createBy: logCreateBy,
            customer: customerData._id,
            zalo: zaloInfo.zalo._id,
        });
    }

    if (sendResult?.status) {
        await pushCareLog(
            customerData._id,
            `[Auto] Đã gửi tin nhắn trước phẫu thuật cho dịch vụ ${template.serviceName}${courseName ? ` (${courseName})` : ''}.`,
            session?.id
        );
        return { success: true };
    }

    const errorMessage =
        sendResult?.content?.error_message ||
        sendResult?.message ||
        'Không thể gửi tin nhắn trước phẫu thuật qua Zalo.';

    await pushCareLog(
        customerData._id,
        `[Auto] Gửi tin nhắn trước phẫu thuật thất bại cho dịch vụ ${template.serviceName}${courseName ? ` (${courseName})` : ''}: ${errorMessage}`,
        session?.id
    );

    return { error: errorMessage };
}

/* ============================================================
 * DATA BRIDGE (Giữ nguyên hành vi)
 * ============================================================ */
export async function customer_data(params = {}) {
    // Giữ nguyên hàm này
    return await getCustomersAll();
}

export async function reloadCustomers() {
    // Giữ nguyên hàm này
    revalidateTag('customers');
}

/* ============================================================
 * ACTION: LẤY DỮ LIỆU ĐẦY ĐỦ TỪ service_details COLLECTION
 * ============================================================ */
export async function getServiceDetailById(serviceDetailId) {
    const session = await checkAuthToken();
    if (!session?.id) {
        return { success: false, error: 'Yêu cầu đăng nhập.' };
    }

    if (!serviceDetailId || !isValidObjectId(serviceDetailId)) {
        return { success: false, error: 'serviceDetailId không hợp lệ.' };
    }

    try {
        await connectDB();
        
        const serviceDetail = await ServiceDetail.findById(serviceDetailId)
            .populate('customerId', 'name phone email')
            .populate('serviceId', 'name')
            .populate('closedBy', 'name avt')
            .populate('createdBy', 'name avt')
            .populate('approvedBy', 'name avt')
            .lean();

        if (!serviceDetail) {
            return { success: false, error: 'Không tìm thấy đơn chốt dịch vụ.' };
        }

        // Convert dữ liệu thành JSON-safe format (theo cấu trúc database: service_details)
        const plainData = JSON.parse(JSON.stringify(serviceDetail));
        // Giữ selectedService trùng với serviceId (đã populate) để view/form dùng chung
        if (plainData.serviceId && !plainData.selectedService) {
            plainData.selectedService = plainData.serviceId;
        }

        return { success: true, data: plainData };
    } catch (error) {
        console.error('Lỗi khi lấy service detail:', error);
        return { success: false, error: 'Đã xảy ra lỗi phía máy chủ.' };
    }
}

/* ============================================================
 * ACTION CHO BƯỚC 6 - CHỐT DỊCH VỤ (Chờ duyệt)
 * ============================================================ */
export async function closeServiceAction(prevState, formData) {
    const session = await checkAuthToken();
    if (!session?.id) {
        return { success: false, error: 'Yêu cầu đăng nhập.' };
    }

    // 1. Lấy dữ liệu từ FormData
    const customerId = String(formData.get('customerId') || '');
    const status = String(formData.get('status') || 'completed');
    const notes = String(formData.get('notes') || '');
    const invoiceImages = formData.getAll('invoiceImage');
    const customerPhotos = formData.getAll('customerPhotos');
    const selectedServiceId = String(formData.get('selectedService') || '');
    const selectedCourseName = String(formData.get('selectedCourseName') || '');
    const discountType = String(formData.get('discountType') || 'none');
    const discountValue = Number(formData.get('discountValue') || 0);
    const adjustmentType = String(formData.get('adjustmentType') || 'none');
    const adjustmentValue = Number(formData.get('adjustmentValue') || 0);
    const idCTKM = formData.get('idCTKM') ? String(formData.get('idCTKM')).trim() : null;
    const name_CTKM = formData.get('name_CTKM') ? String(formData.get('name_CTKM')).trim() : '';

    // 2. Validation cơ bản
    if (!customerId || !isValidObjectId(customerId)) {
        return { success: false, error: 'ID khách hàng không hợp lệ.' };
    }
    if (!['completed', 'in_progress', 'rejected'].includes(status)) {
        return { success: false, error: 'Trạng thái không hợp lệ.' };
    }

    // Validation cho các trường hợp không phải "Từ chối"
    if (status !== 'rejected') {
        if (!invoiceImages || invoiceImages.length === 0 || invoiceImages[0].size === 0) {
            return { success: false, error: 'Ảnh hóa đơn/hợp đồng là bắt buộc.' };
        }
        if (!selectedServiceId || !isValidObjectId(selectedServiceId)) {
            return { success: false, error: 'Vui lòng chọn dịch vụ hợp lệ.' };
        }
        if (!selectedCourseName) {
            return { success: false, error: 'Vui lòng chọn một liệu trình để chốt.' };
        }
    }

    try {
        await connectDB();

        let listPrice = 0;
        let finalPrice = 0;
        let courseSnapshot = null;

        // 3. Tìm liệu trình và tính toán giá (nếu cần)
        if (status !== 'rejected') {
            const serviceDoc = await Service.findById(selectedServiceId).lean();
            if (!serviceDoc) {
                return { success: false, error: 'Không tìm thấy dịch vụ đã chọn.' };
            }

            const course = serviceDoc.treatmentCourses.find(c => c.name === selectedCourseName);
            if (!course) {
                return { success: false, error: 'Không tìm thấy liệu trình trong dịch vụ đã chọn.' };
            }

            const costs = course.costs || {};
            listPrice = (costs.basePrice || 0) + (costs.fullMedication || 0) + (costs.partialMedication || 0) + (costs.otherFees || 0);

            // Tính giá cuối cùng dựa trên điều chỉnh
            if (adjustmentType === 'discount') {
                if (discountType === 'amount') {
                    finalPrice = Math.max(0, listPrice - discountValue);
                } else if (discountType === 'percent') {
                    finalPrice = Math.max(0, Math.round(listPrice * (1 - discountValue / 100)));
                } else {
                    finalPrice = listPrice;
                }
            } else if (adjustmentType === 'increase') {
                if (discountType === 'amount') {
                    finalPrice = Math.max(0, listPrice + adjustmentValue);
                } else if (discountType === 'percent') {
                    finalPrice = Math.max(0, Math.round(listPrice * (1 + adjustmentValue / 100)));
                } else {
                    finalPrice = listPrice;
                }
            } else {
                finalPrice = listPrice;
            }

            const medicationName = String(formData.get('medicationName') || '').trim();
            const medicationDosage = String(formData.get('medicationDosage') || '').trim();
            const medicationUnit = String(formData.get('medicationUnit') || '').trim();
            const consultantName = String(formData.get('consultantName') || '').trim();
            const doctorName = String(formData.get('doctorName') || '').trim();
            
            courseSnapshot = {
                name: course.name,
                description: course.description,
                costs: course.costs,
                medicationName: medicationName,
                medicationDosage: medicationDosage,
                medicationUnit: medicationUnit,
                consultantName: consultantName,
                doctorName: doctorName,
            };
        }

        // 4. Upload nhiều ảnh lên Drive
        const uploadedFileIds = [];
        if (invoiceImages.length > 0 && invoiceImages[0].size > 0) {
            const folderId = '1vNTcGy_oYM9phqutlvt-Fc5td8bFTkSm'; // Thay bằng ID folder Drive của bạn
            for (const image of invoiceImages) {
                const uploadedFile = await uploadFileToDrive(image, folderId);
                if (uploadedFile?.id) {
                    uploadedFileIds.push(uploadedFile.id);
                }
            }
            // Nếu có file nhưng không upload được file nào thì báo lỗi
            if (uploadedFileIds.length === 0) {
                return { success: false, error: 'Tải ảnh lên không thành công, vui lòng thử lại.' };
            }
        }

        // Upload ảnh khách hàng
        const uploadedCustomerPhotoIds = [];
        if (customerPhotos.length > 0 && customerPhotos[0].size > 0) {
            const folderId = '1vNTcGy_oYM9phqutlvt-Fc5td8bFTkSm';
            for (const photo of customerPhotos) {
                const uploadedFile = await uploadFileToDrive(photo, folderId);
                if (uploadedFile?.id) {
                    uploadedCustomerPhotoIds.push(uploadedFile.id);
                }
            }
        }

        // 5. Nạp thông tin khách hàng
        const customerDoc = await Customer.findById(customerId);
        if (!customerDoc) return { success: false, error: 'Không tìm thấy khách hàng.' };

        // Xử lý serviceId: nếu rejected và không có serviceId, dùng service đầu tiên từ tags làm fallback
        let finalServiceId = selectedServiceId;
        if (!finalServiceId || !isValidObjectId(finalServiceId)) {
            if (status === 'rejected' && customerDoc.tags && customerDoc.tags.length > 0) {
                finalServiceId = String(customerDoc.tags[0]);
            } else if (!finalServiceId || !isValidObjectId(finalServiceId)) {
                return { success: false, error: 'Vui lòng chọn dịch vụ hợp lệ.' };
            }
        }

        // Map status từ form sang ServiceDetail model
        // Form: 'completed', 'in_progress', 'rejected'
        // Model: 'processing', 'completed', 'cancelled'
        let serviceDetailStatus = 'processing';
        if (status === 'completed') {
            serviceDetailStatus = 'completed';
        } else if (status === 'rejected') {
            serviceDetailStatus = 'cancelled';
        }

        // 6. Tạo document trong service_details collection
        const newServiceDetailDoc = new ServiceDetail({
            customerId: customerId,
            serviceId: finalServiceId,
            sourceId: customerDoc.source || null,
            sourceDetails: customerDoc.sourceDetails || '',
            approvalStatus: 'pending',
            status: serviceDetailStatus,
            notes: notes || '',
            selectedCourse: courseSnapshot,
            pricing: {
                listPrice: listPrice,
                discountType: discountType,
                discountValue: discountValue,
                adjustmentType: adjustmentType,
                adjustmentValue: adjustmentValue,
                finalPrice: finalPrice,
            },
            name_CTKM: name_CTKM || '',
            idCTKM: idCTKM && isValidObjectId(idCTKM) ? idCTKM : null,
            revenue: finalPrice,
            invoiceDriveIds: uploadedFileIds,
            customerPhotosDriveIds: uploadedCustomerPhotoIds,
            closedAt: new Date(),
            closedBy: session.id,
            createdBy: session.id,
            // Khởi tạo các mảng rỗng
            payments: [],
            costs: [],
            commissions: [],
            amountReceivedTotal: 0,
            outstandingAmount: finalPrice, // Công nợ ban đầu = finalPrice
        });

        // Lưu document vào service_details collection
        const savedServiceDetail = await newServiceDetailDoc.save();
        const serviceDetailId = savedServiceDetail._id;

        // 6b. Không tạo treatment_session khi chốt đơn. "Lần sử dụng" sẽ là 1 khi nhấn Thực hiện liệu trình
        // lần đầu; nếu tạo sẵn 1 session thì nextUsageIndex thành 2 sai với mong đợi.

        if (serviceDetailStatus === 'completed' && savedServiceDetail?.closedAt) {
            try {
                const d = new Date(savedServiceDetail.closedAt);
                const dateStr = d.toISOString().slice(0, 10);
                await rebuildFinancialReportDailyForDateRange(dateStr, dateStr);
            } catch (e) {
                console.error('[closeServiceAction] Rebuild financial daily failed:', e?.message || e);
            }
        }

        // 7. Chuẩn bị các cập nhật cho customer
        // Sử dụng raw MongoDB collection để bypass Mongoose schema validation
        const db = mongoose.connection.db;
        const customersCollection = db.collection(Customer.collection.name);
        
        // Xác định customerType: đếm số serviceDetails hiện có (không tính đơn mới đang tạo)
        // Nếu số đơn = 0 → khách mới, nếu > 0 → khách cũ
        const existingServiceDetailsCount = customerDoc.serviceDetails?.length || 0;
        const customerType = existingServiceDetailsCount === 0 ? 'new' : 'old';
        
        const snapshotServiceIdOid = new mongoose.Types.ObjectId(finalServiceId);
        const pushSnapshot = {
            serviceDetailId: new mongoose.Types.ObjectId(serviceDetailId),
            serviceId: snapshotServiceIdOid,
            selectedService: snapshotServiceIdOid,
            approvalStatus: 'pending',
            status: status,
            closedAt: new Date(),
            amountReceivedTotal: 0,
            outstandingAmount: finalPrice,
            pricing: { listPrice, discountType, discountValue, adjustmentType, adjustmentValue, finalPrice },
            name_CTKM: name_CTKM || '',
            idCTKM: idCTKM && isValidObjectId(idCTKM) ? new mongoose.Types.ObjectId(idCTKM) : null,
        };
        if (courseSnapshot && (courseSnapshot.name || selectedCourseName)) {
            pushSnapshot.selectedCourse = courseSnapshot && courseSnapshot.name
                ? courseSnapshot
                : { name: selectedCourseName || '' };
        }
        const updateData = {
            $push: {
                serviceDetails: pushSnapshot,
                care: {
                    content: `[Chốt dịch vụ] Trạng thái: ${status}. ${selectedCourseName ? `Liệu trình: ${selectedCourseName}. ` : ''}Ghi chú: ${notes || 'Không có'}`,
                    createBy: new mongoose.Types.ObjectId(session.id),
                    createAt: new Date(),
                    step: 6
                }
            },
            // ✅ Cập nhật customerType: nếu đây là đơn đầu tiên → 'new', nếu đã có đơn → 'old'
            $set: {
                customerType: customerType,
            },
        };

        // 8. Cập nhật pipeline nếu cần
        const newPipelineStatus = pipelineFromServiceStatus(status);
        if (newPipelineStatus) {
            // Kiểm tra xem có nên cập nhật không (chỉ cập nhật nếu step mới > step hiện tại)
            const validatedStatus = validatePipelineStatusUpdate(customerDoc, newPipelineStatus);
            if (validatedStatus) {
                const pipelineStatus = customerDoc.pipelineStatus || [];
                pipelineStatus[6] = validatedStatus;
                // Khởi tạo $set nếu chưa có
                if (!updateData.$set) {
                    updateData.$set = {};
                }
                updateData.$set.pipelineStatus = pipelineStatus;
            }
        }

        // 9. Thêm serviceId vào service_use (không trùng lặp)
        updateData.$addToSet = {
            service_use: new mongoose.Types.ObjectId(finalServiceId),
        };

        // 10. Cập nhật customer với raw MongoDB để tránh schema validation
        await customersCollection.updateOne(
            { _id: new mongoose.Types.ObjectId(customerId) },
            updateData
        );

        await rebuildHistoryServiceForCustomer(customerId);

        // 11. Schedule gửi tin nhắn trước phẫu thuật (chỉ khi status !== 'rejected' và có selectedService + selectedCourse)
        if (status !== 'rejected' && finalServiceId && selectedCourseName) {
            try {
                console.log(`[closeServiceAction] 🚀 Bắt đầu schedule tin nhắn trước phẫu thuật cho customerId: ${customerId}, selectedServiceId: ${finalServiceId}, selectedCourseName: ${selectedCourseName}`);
                console.log(`[closeServiceAction] ✅ Tìm thấy serviceDetailId: ${serviceDetailId}`);

                const { default: initAgenda } = await import('@/config/agenda');
                const agenda = await initAgenda();
                const sendAt = new Date(Date.now() + 60 * 60 * 1000); // 1 giờ sau khi tạo đơn
                // const sendAt = new Date(Date.now() + 60 * 1000); // 1 phút sau khi tạo đơn
                
                console.log(`[closeServiceAction] 📅 Schedule job 'servicePreSurgeryMessage' vào lúc: ${sendAt.toISOString()} (${sendAt.toLocaleString('vi-VN')})`);
                
                const scheduledJob = await agenda.schedule(sendAt, 'servicePreSurgeryMessage', {
                    customerId,
                    serviceDetailId: serviceDetailId.toString(),
                    triggeredBy: session.id,
                });
                
                console.log(`[closeServiceAction] ✅ Đã schedule thành công! Job ID: ${scheduledJob._id}, serviceDetailId: ${serviceDetailId}, sẽ chạy vào: ${sendAt.toISOString()}`);
            } catch (scheduleError) {
                console.error('[closeServiceAction] ❌ Lỗi khi schedule gửi tin nhắn trước phẫu thuật:', scheduleError);
                console.error('[closeServiceAction] ❌ Error stack:', scheduleError?.stack);
                // Không throw error để không ảnh hưởng đến việc tạo đơn
            }
        } else {
            console.log(`[closeServiceAction] ⏭️ Bỏ qua schedule tin nhắn trước phẫu thuật. status: ${status}, selectedServiceId: ${finalServiceId}, selectedCourseName: ${selectedCourseName}`);
        }

        revalidateData(); // Hàm revalidate của bạn
        return { success: true, message: 'Chốt dịch vụ thành công! Đơn đang chờ duyệt.' };
    } catch (error) {
        console.error('Lỗi khi chốt dịch vụ: ', error);
        return { success: false, error: 'Đã xảy ra lỗi phía máy chủ.' };
    }
}
/* ============================================================
 * ACTION CHO BƯỚC 4 - LƯU KẾT QUẢ CUỘC GỌI (Đã cập nhật)
 * ============================================================ */
export async function saveCallResultAction(prevState, formData) {
    const session = await checkAuthToken();
    if (!session?.id) {
        return { success: false, error: 'Yêu cầu đăng nhập.' };
    }

    const customerId = formData.get('customerId');
    const newStatus = formData.get('status');
    const callDuration = formData.get('callDuration');
    const callStartTime = formData.get('callStartTime');
    const recordingFile = formData.get('recordingFile');
    const recordingFileName = formData.get('recordingFileName'); // Giữ lại để trả về cho UI nếu cần

    if (!customerId || !newStatus || !recordingFile || recordingFile.size === 0) {
        return { success: false, error: 'Thiếu thông tin khách hàng, trạng thái hoặc file ghi âm.' };
    }

    try {
        await connectDB();

        // SỬ DỤNG HÀM MỚI: Tải file ghi âm lên 
        // ?? id folder này là id của folder ảnh?
        const folderId = '1vNTcGy_oYM9phqutlvt-Fc5td8bFTkSm'; // Cần thêm biến này
        const uploadedFile = await uploadFileToDrive(recordingFile, folderId);

        if (!uploadedFile?.id) {
            throw new Error('Tải file ghi âm lên Drive thất bại.');
        }

        // CẬP NHẬT: Lấy link trực tiếp từ kết quả trả về của hàm upload
        const callStartFormatted = new Date(callStartTime).toLocaleTimeString('vi-VN');
        const logContent = `Đã gọi ${callDuration} lúc ${callStartFormatted}. Trạng thái: ${newStatus}. Ghi âm: ${uploadedFile.webViewLink || 'đã lưu'
            }`;

        const careNote = {
            content: logContent,
            createBy: session.id,
            createAt: new Date(),
            step: 4,
        };

        // Kiểm tra xem có nên cập nhật không (chỉ cập nhật nếu step mới > step hiện tại)
        const customer = await Customer.findById(customerId).lean();
        const validatedStatus = validatePipelineStatusUpdate(customer, newStatus);
        if (validatedStatus) {
            await Customer.findByIdAndUpdate(customerId, {
                $set: {
                    'pipelineStatus.0': validatedStatus,
                    'pipelineStatus.3': validatedStatus,
                },
                $push: { care: careNote },
            });
        } else {
            // Vẫn push care note dù không cập nhật pipelineStatus
            await Customer.findByIdAndUpdate(customerId, {
                $push: { care: careNote },
            });
        }

        revalidateData();
        return {
            success: true,
            message: 'Đã lưu kết quả cuộc gọi thành công!',
            newRecording: {
                name: recordingFileName,
                driveLink: uploadedFile.webViewLink,
                status: 'uploaded',
            },
        };
    } catch (error) {
        console.error('Lỗi khi lưu kết quả cuộc gọi: ', error);
        return { success: false, error: `Đã xảy ra lỗi phía máy chủ: ${error.message}` };
    }
}

/* ============================================================
 * SỬA serviceDetails (CHỈ KHI PENDING)
 * - Cập nhật: status, notes, selectedService, pricing (nếu có), invoice
 * - Không cho sửa nếu approvalStatus='approved'
 * ============================================================ */
export async function updateServiceDetailAction(prevState, formData) {
    const session = await checkAuthToken();
    if (!session?.id) return { success: false, error: 'Yêu cầu đăng nhập.' };

    const customerId = String(formData.get('customerId') || '');
    const serviceDetailId = String(formData.get('serviceDetailId') || '');

    const statusRaw = formData.get('status') != null ? String(formData.get('status')) : undefined;
    const notes = formData.get('notes') != null ? String(formData.get('notes')) : undefined;
    const selectedService =
        formData.get('selectedService') != null ? String(formData.get('selectedService')) : undefined;
    const selectedCourseName = formData.get('selectedCourseName') != null ? String(formData.get('selectedCourseName')) : undefined;
    const medicationName = formData.get('medicationName') != null ? String(formData.get('medicationName')).trim() : undefined;
    const medicationDosage = formData.get('medicationDosage') != null ? String(formData.get('medicationDosage')).trim() : undefined;
    const medicationUnit = formData.get('medicationUnit') != null ? String(formData.get('medicationUnit')).trim() : undefined;
    const consultantName = formData.get('consultantName') != null ? String(formData.get('consultantName')).trim() : undefined;
    const doctorName = formData.get('doctorName') != null ? String(formData.get('doctorName')).trim() : undefined;

    const listPrice = formData.get('listPrice') != null ? Number(formData.get('listPrice')) : undefined;
    const discountType =
        formData.get('discountType') != null ? String(formData.get('discountType')) : undefined; // none|amount|percent
    const discountValue =
        formData.get('discountValue') != null ? Number(formData.get('discountValue')) : undefined;
    const adjustmentType =
        formData.get('adjustmentType') != null ? String(formData.get('adjustmentType')) : undefined; // none|discount|increase
    const adjustmentValue =
        formData.get('adjustmentValue') != null ? Number(formData.get('adjustmentValue')) : undefined;
    const finalPrice = formData.get('finalPrice') != null ? Number(formData.get('finalPrice')) : undefined;
    const idCTKMUpdate = formData.get('idCTKM') != null ? String(formData.get('idCTKM')).trim() || null : undefined;
    const name_CTKMUpdate = formData.get('name_CTKM') != null ? String(formData.get('name_CTKM')).trim() : undefined;

    // 🧩 ĐỌC MẢNG FILES ĐÚNG CÁCH
    const invoiceImagesRaw = formData.getAll('invoiceImage') || [];
    const invoiceImages = invoiceImagesRaw.filter(
        (f) => f && typeof f === 'object' && 'size' in f && Number(f.size) > 0
    );

    const customerPhotosRaw = formData.getAll('customerPhotos') || [];
    const customerPhotos = customerPhotosRaw.filter(
        (f) => f && typeof f === 'object' && 'size' in f && Number(f.size) > 0
    );

    if (!isValidObjectId(customerId) || !isValidObjectId(serviceDetailId)) {
        return { success: false, error: 'customerId/serviceDetailId không hợp lệ.' };
    }
    if (statusRaw && !allowedServiceStatus.has(statusRaw)) {
        return { success: false, error: 'Trạng thái không hợp lệ (new|in_progress|completed).' };
    }
    if (selectedService && !isValidObjectId(selectedService)) {
        return { success: false, error: 'Dịch vụ chốt không hợp lệ.' };
    }

    try {
        await connectDB();

        // Tìm trong service_details collection
        const serviceDetail = await ServiceDetail.findById(serviceDetailId);
        if (!serviceDetail) {
            return { success: false, error: 'Không tìm thấy đơn chốt dịch vụ.' };
        }
        
        // Kiểm tra customerId có khớp không
        if (String(serviceDetail.customerId) !== String(customerId)) {
            return { success: false, error: 'Đơn chốt dịch vụ không thuộc khách hàng này.' };
        }
        
        if (serviceDetail.approvalStatus === 'approved') {
            return { success: false, error: 'Đơn đã duyệt. Không thể chỉnh sửa.' };
        }

        const customer = await Customer.findById(customerId);
        if (!customer) return { success: false, error: 'Không tìm thấy khách hàng.' };

        // Chỉ sửa đơn chưa duyệt → không đụng lifetime_revenue (chỉ cập nhật khi đơn đã duyệt → sửa giá, hoặc pending→approved)

        // Map status từ form sang ServiceDetail model nếu cần
        let serviceDetailStatus = serviceDetail.status;
        if (typeof statusRaw !== 'undefined') {
            // Form: 'completed', 'in_progress', 'rejected'
            // Model: 'processing', 'completed', 'cancelled'
            if (statusRaw === 'completed') {
                serviceDetailStatus = 'completed';
            } else if (statusRaw === 'in_progress') {
                serviceDetailStatus = 'processing';
            } else if (statusRaw === 'rejected') {
                serviceDetailStatus = 'cancelled';
            }
        }

        // Cập nhật các field cơ bản trong service_details collection
        if (typeof statusRaw !== 'undefined') serviceDetail.status = serviceDetailStatus;
        if (typeof notes !== 'undefined') serviceDetail.notes = notes;
        if (typeof selectedService !== 'undefined') serviceDetail.serviceId = selectedService;

        // Cập nhật selectedCourse nếu có thông tin mới
        if (typeof selectedCourseName !== 'undefined' || typeof medicationName !== 'undefined' || typeof medicationDosage !== 'undefined' || typeof medicationUnit !== 'undefined' || typeof consultantName !== 'undefined' || typeof doctorName !== 'undefined') {
            // Nếu có selectedCourseName, cần tìm course từ service để lấy thông tin đầy đủ
            if (selectedCourseName && selectedService) {
                try {
                    const serviceDoc = await Service.findById(selectedService).lean();
                    if (serviceDoc) {
                        const course = serviceDoc.treatmentCourses.find(c => c.name === selectedCourseName);
                        if (course) {
                            // Cập nhật selectedCourse với thông tin từ service + thông tin thuốc mới
                            serviceDetail.selectedCourse = {
                                name: course.name,
                                description: course.description || serviceDetail.selectedCourse?.description || '',
                                costs: course.costs || {},
                                medicationName: typeof medicationName !== 'undefined' ? medicationName : (serviceDetail.selectedCourse?.medicationName || ''),
                                medicationDosage: typeof medicationDosage !== 'undefined' ? medicationDosage : (serviceDetail.selectedCourse?.medicationDosage || ''),
                                medicationUnit: typeof medicationUnit !== 'undefined' ? medicationUnit : (serviceDetail.selectedCourse?.medicationUnit || ''),
                                consultantName: typeof consultantName !== 'undefined' ? consultantName : (serviceDetail.selectedCourse?.consultantName || ''),
                                doctorName: typeof doctorName !== 'undefined' ? doctorName : (serviceDetail.selectedCourse?.doctorName || ''),
                            };
                        }
                    }
                } catch (err) {
                    console.error('Error updating selectedCourse:', err);
                }
            } else if (serviceDetail.selectedCourse) {
                // Chỉ cập nhật các trường mới nếu không có selectedCourseName mới
                if (typeof medicationName !== 'undefined') {
                    serviceDetail.selectedCourse.medicationName = medicationName;
                }
                if (typeof medicationDosage !== 'undefined') {
                    serviceDetail.selectedCourse.medicationDosage = medicationDosage;
                }
                if (typeof medicationUnit !== 'undefined') {
                    serviceDetail.selectedCourse.medicationUnit = medicationUnit;
                }
                if (typeof consultantName !== 'undefined') {
                    serviceDetail.selectedCourse.consultantName = consultantName;
                }
                if (typeof doctorName !== 'undefined') {
                    serviceDetail.selectedCourse.doctorName = doctorName;
                }
            }
        }

        // Cập nhật pricing nếu có
        if (
            typeof listPrice !== 'undefined' ||
            typeof discountType !== 'undefined' ||
            typeof discountValue !== 'undefined' ||
            typeof adjustmentType !== 'undefined' ||
            typeof adjustmentValue !== 'undefined' ||
            typeof finalPrice !== 'undefined'
        ) {
            const current = serviceDetail.pricing || {};
            const next = { ...current };

            if (typeof listPrice === 'number' && Number.isFinite(listPrice)) next.listPrice = listPrice;

            if (typeof discountType !== 'undefined') {
                next.discountType = ['none', 'amount', 'percent'].includes(discountType)
                    ? discountType
                    : current.discountType || 'none';
            }

            if (typeof discountValue === 'number' && Number.isFinite(discountValue))
                next.discountValue = discountValue;

            if (typeof adjustmentType !== 'undefined') {
                next.adjustmentType = ['none', 'discount', 'increase'].includes(adjustmentType)
                    ? adjustmentType
                    : current.adjustmentType || 'none';
            }

            if (typeof adjustmentValue === 'number' && Number.isFinite(adjustmentValue))
                next.adjustmentValue = adjustmentValue;

            if (typeof finalPrice === 'number' && Number.isFinite(finalPrice)) next.finalPrice = finalPrice;

            serviceDetail.pricing = next;
            // Cập nhật revenue nếu có finalPrice
            if (next.finalPrice !== undefined) {
                serviceDetail.revenue = next.finalPrice;
            }
        }

        // Chương trình khuyến mãi
        if (typeof idCTKMUpdate !== 'undefined') {
            serviceDetail.idCTKM = idCTKMUpdate && isValidObjectId(idCTKMUpdate) ? idCTKMUpdate : null;
        }
        if (typeof name_CTKMUpdate !== 'undefined') {
            serviceDetail.name_CTKM = name_CTKMUpdate || '';
        }

        // 📸 Xử lý xóa ảnh và cập nhật danh sách ảnh
        const deletedImageIdsRaw = formData.getAll('deletedImageIds') || [];
        const deletedImageIds = Array.isArray(deletedImageIdsRaw) ? deletedImageIdsRaw.filter(id => id) : [];
        
        // Lấy existingImageIds từ formData (ảnh đã lưu theo thứ tự mới từ unified state)
        const existingIdsRaw = formData.getAll('existingImageIds') || [];
        let existingIds = Array.isArray(existingIdsRaw) ? existingIdsRaw.filter(id => id) : [];
        
        // Xóa các ID đã chọn xóa khỏi existingIds trước khi xử lý
        if (deletedImageIds.length > 0) {
            existingIds = existingIds.filter(id => !deletedImageIds.includes(id));
        }

        // 📸 Upload thêm invoice (nếu có file mới)
        if (invoiceImages.length > 0) {
            const folderId = '1vNTcGy_oYM9phqutlvt-Fc5td8bFTkSm';
            const uploaded = [];
            for (const f of invoiceImages) {
                const up = await uploadFileToDrive(f, folderId);
                if (up?.id) uploaded.push(up.id);
            }
            if (uploaded.length === 0) {
                return { success: false, error: 'Tải ảnh lên không thành công. Vui lòng thử lại.' };
            }
            
            // Gán lại với existingIds đã được lọc (đã xóa ID cần xóa) + ảnh mới
            if (existingIds.length > 0) {
                serviceDetail.invoiceDriveIds = [...existingIds, ...uploaded];
            } else {
                // Nếu không có existingIds, lấy từ serviceDetail hiện tại và lọc bỏ ID đã xóa
                const currentIds = (serviceDetail.invoiceDriveIds || []).filter(id => !deletedImageIds.includes(id));
                serviceDetail.invoiceDriveIds = [...currentIds, ...uploaded];
            }
        } else {
            // Chỉ sắp xếp lại mà không thêm ảnh mới
            if (existingIds.length > 0) {
                // Có existingIds: dùng danh sách đã được lọc (đã xóa ID cần xóa)
                serviceDetail.invoiceDriveIds = existingIds;
            } else if (deletedImageIds.length > 0) {
                // Không có existingIds nhưng có ID cần xóa: xóa khỏi danh sách hiện tại
                serviceDetail.invoiceDriveIds = (serviceDetail.invoiceDriveIds || []).filter(id => !deletedImageIds.includes(id));
            }
            // Nếu không có existingIds và không có ID cần xóa: giữ nguyên
        }

        // 📸 Xử lý xóa ảnh khách hàng và cập nhật danh sách ảnh
        const deletedCustomerPhotoIdsRaw = formData.getAll('deletedCustomerPhotoIds') || [];
        const deletedCustomerPhotoIds = Array.isArray(deletedCustomerPhotoIdsRaw) ? deletedCustomerPhotoIdsRaw.filter(id => id) : [];
        
        // Lấy existingCustomerPhotoIds từ formData (ảnh đã lưu theo thứ tự mới từ unified state)
        const existingCustomerPhotoIdsRaw = formData.getAll('existingCustomerPhotoIds') || [];
        let existingCustomerPhotoIds = Array.isArray(existingCustomerPhotoIdsRaw) ? existingCustomerPhotoIdsRaw.filter(id => id) : [];
        
        // Xóa các ID đã chọn xóa khỏi existingCustomerPhotoIds trước khi xử lý
        if (deletedCustomerPhotoIds.length > 0) {
            existingCustomerPhotoIds = existingCustomerPhotoIds.filter(id => !deletedCustomerPhotoIds.includes(id));
        }

        // Xử lý ảnh khách hàng
        if (customerPhotos.length > 0) {
            const folderId = '1vNTcGy_oYM9phqutlvt-Fc5td8bFTkSm';
            const uploaded = [];
            for (const f of customerPhotos) {
                const up = await uploadFileToDrive(f, folderId);
                if (up?.id) uploaded.push(up.id);
            }
            if (uploaded.length > 0) {
                // Gán lại với existingCustomerPhotoIds đã được lọc (đã xóa ID cần xóa) + ảnh mới
                if (existingCustomerPhotoIds.length > 0) {
                    serviceDetail.customerPhotosDriveIds = [...existingCustomerPhotoIds, ...uploaded];
                } else {
                    // Nếu không có existingCustomerPhotoIds, lấy từ serviceDetail hiện tại và lọc bỏ ID đã xóa
                    const currentIds = (serviceDetail.customerPhotosDriveIds || []).filter(id => !deletedCustomerPhotoIds.includes(id));
                    serviceDetail.customerPhotosDriveIds = [...currentIds, ...uploaded];
                }
            }
        } else {
            // Chỉ sắp xếp lại mà không thêm ảnh mới
            if (existingCustomerPhotoIds.length > 0) {
                // Có existingCustomerPhotoIds: dùng danh sách đã được lọc (đã xóa ID cần xóa)
                serviceDetail.customerPhotosDriveIds = existingCustomerPhotoIds;
            } else if (deletedCustomerPhotoIds.length > 0) {
                // Không có existingCustomerPhotoIds nhưng có ID cần xóa: xóa khỏi danh sách hiện tại
                serviceDetail.customerPhotosDriveIds = (serviceDetail.customerPhotosDriveIds || []).filter(id => !deletedCustomerPhotoIds.includes(id));
            }
            // Nếu không có existingCustomerPhotoIds và không có ID cần xóa: giữ nguyên
        }

        // Lưu serviceDetail vào service_details collection
        await serviceDetail.save();

        // Cập nhật snapshot trong customers.serviceDetails[] (không đụng lifetime_revenue)
        // Cập nhật cả serviceId để giao diện nhóm/tên dịch vụ hiển thị đúng sau khi sửa đơn
        const newFinalPrice = Number(serviceDetail.pricing?.finalPrice ?? serviceDetail.revenue ?? 0) || 0;
        const newServiceId = serviceDetail.serviceId;
        const db = mongoose.connection.db;
        const customersCollection = db.collection(Customer.collection.name);
        const statusForSnapshot = typeof statusRaw !== 'undefined'
            ? statusRaw
            : (serviceDetail.status === 'processing' ? 'in_progress' : serviceDetail.status === 'cancelled' ? 'rejected' : serviceDetail.status);
        const pricing = serviceDetail.pricing || {};
        const snapshotSet = {
            'serviceDetails.$.status': statusForSnapshot,
            'serviceDetails.$.pricing.listPrice': Number(pricing.listPrice ?? 0) || 0,
            'serviceDetails.$.pricing.discountType': pricing.discountType || 'none',
            'serviceDetails.$.pricing.discountValue': Number(pricing.discountValue ?? 0) || 0,
            'serviceDetails.$.pricing.adjustmentType': pricing.adjustmentType || 'none',
            'serviceDetails.$.pricing.adjustmentValue': Number(pricing.adjustmentValue ?? 0) || 0,
            'serviceDetails.$.pricing.finalPrice': newFinalPrice,
            'serviceDetails.$.amountReceivedTotal': serviceDetail.amountReceivedTotal ?? 0,
            'serviceDetails.$.outstandingAmount': serviceDetail.outstandingAmount ?? 0,
            'serviceDetails.$.name_CTKM': serviceDetail.name_CTKM ?? '',
            'serviceDetails.$.idCTKM': serviceDetail.idCTKM || null,
        };
        if (newServiceId) {
            const oid = new mongoose.Types.ObjectId(newServiceId);
            snapshotSet['serviceDetails.$.serviceId'] = oid;
            snapshotSet['serviceDetails.$.selectedService'] = oid;
        }
        await customersCollection.updateOne(
            {
                _id: new mongoose.Types.ObjectId(customerId),
                'serviceDetails.serviceDetailId': new mongoose.Types.ObjectId(serviceDetailId)
            },
            { $set: snapshotSet }
        );

        // Rebuild service_use từ serviceDetails (sửa dịch vụ A→B: thêm B, bỏ A nếu không còn đơn nào dùng A)
        await rebuildServiceUseForCustomer(customerId);
        await rebuildHistoryServiceForCustomer(customerId);

        // Cập nhật pipeline theo status hiện tại của serviceDetail
        const finalStatus = serviceDetailStatus;
        const newPipeline = pipelineFromServiceStatus(finalStatus);
        // Kiểm tra xem có nên cập nhật không (chỉ cập nhật nếu step mới > step hiện tại)
        // Convert customer document sang plain object để validate
        const customerPlain = customer.toObject ? customer.toObject() : customer;
        const validatedPipeline = validatePipelineStatusUpdate(customerPlain, newPipeline);
        if (validatedPipeline) {
            await Customer.updateOne(
                { _id: customerId },
                {
                    $set: {
                        'pipelineStatus.0': validatedPipeline,
                        'pipelineStatus.6': validatedPipeline,
                    },
                }
            );
        }

        await pushCareLog(
            customerId,
            `[Sửa đơn chốt] #${serviceDetailId} ${statusRaw ? `(status → ${statusRaw})` : ''}${notes ? ` | Ghi chú: ${notes}` : ''}`,
            session.id
        );

        revalidateData();
        return { success: true, message: 'Đã cập nhật đơn chốt (pending).' };
    } catch (error) {
        console.error('[updateServiceDetailAction] error:', error);
        return { success: false, error: 'Lỗi server khi cập nhật đơn chốt.' };
    }
}

/* ============================================================
 * XÓA serviceDetails (CHỈ KHI PENDING)
 * ============================================================ */
export async function deleteServiceDetailAction(prevState, formData) {
    const session = await checkAuthToken();
    if (!session?.id) return { success: false, error: 'Yêu cầu đăng nhập.' };

    const customerId = String(formData.get('customerId') || '');
    const serviceDetailId = String(formData.get('serviceDetailId') || '');

    if (!isValidObjectId(customerId) || !isValidObjectId(serviceDetailId)) {
        return { success: false, error: 'customerId/serviceDetailId không hợp lệ.' };
    }

    try {
        await connectDB();

        // Tìm trong service_details collection để kiểm tra approvalStatus
        const serviceDetail = await ServiceDetail.findById(serviceDetailId);
        if (!serviceDetail) {
            return { success: false, error: 'Không tìm thấy đơn chốt dịch vụ.' };
        }
        
        // Kiểm tra customerId có khớp không
        if (String(serviceDetail.customerId) !== String(customerId)) {
            return { success: false, error: 'Đơn chốt dịch vụ không thuộc khách hàng này.' };
        }
        
        // Chỉ xóa khi approvalStatus = 'pending'
        if (serviceDetail.approvalStatus !== 'pending') {
            return {
                success: false,
                error: 'Không thể xóa: đơn không ở trạng thái pending hoặc không tồn tại.',
            };
        }

        // Xóa trong service_details collection
        await ServiceDetail.deleteOne({ _id: serviceDetailId });

        // Chỉ xóa đơn chưa duyệt → không trừ lifetime_revenue (đơn chưa duyệt chưa từng cộng vào)
        const db = mongoose.connection.db;
        const customersCollection = db.collection(Customer.collection.name);
        await customersCollection.updateOne(
            { _id: new mongoose.Types.ObjectId(customerId) },
            {
                $pull: {
                    serviceDetails: {
                        serviceDetailId: new mongoose.Types.ObjectId(serviceDetailId),
                    },
                },
            }
        );

        // Rebuild service_use từ serviceDetails (xóa đơn: bỏ id dịch vụ nếu không còn đơn nào dùng)
        await rebuildServiceUseForCustomer(customerId);
        await rebuildHistoryServiceForCustomer(customerId);

        await pushCareLog(customerId, `[Xóa đơn chốt] #${serviceDetailId}`, session.id);

        revalidateData();
        return { success: true, message: 'Đã xóa đơn chốt (pending).' };
    } catch (error) {
        console.error('[deleteServiceDetailAction] error:', error);
        return { success: false, error: 'Lỗi server khi xóa đơn chốt.' };
    }
}

/* ============================================================
 * DUYỆT serviceDetails (PENDING → APPROVED; khóa sửa/xóa)
 * ============================================================ */
export async function approveServiceDetailAction(prevState, formData) {
    const session = await checkAuthToken();
    if (!session?.id) return { success: false, error: 'Yêu cầu đăng nhập.' };

    const customerId = String(formData.get('customerId') || '');
    const serviceDetailId = String(formData.get('serviceDetailId') || '');

    if (!isValidObjectId(customerId) || !isValidObjectId(serviceDetailId)) {
        return { success: false, error: 'customerId/serviceDetailId không hợp lệ.' };
    }

    try {
        await connectDB();
        
        // Tìm trong service_details collection
        const serviceDetail = await ServiceDetail.findById(serviceDetailId);
        if (!serviceDetail) {
            return { success: false, error: 'Không tìm thấy đơn chốt dịch vụ.' };
        }
        
        // Kiểm tra customerId có khớp không
        if (String(serviceDetail.customerId) !== String(customerId)) {
            return { success: false, error: 'Đơn chốt dịch vụ không thuộc khách hàng này.' };
        }
        
        if (serviceDetail.approvalStatus === 'approved') {
            return { success: false, error: 'Đơn đã duyệt trước đó.' };
        }

        // Cập nhật trong service_details collection
        serviceDetail.approvalStatus = 'approved';
        serviceDetail.approvedBy = session.id;
        serviceDetail.approvedAt = new Date();
        await serviceDetail.save();

        const orderTotal = Number(serviceDetail.revenue ?? serviceDetail.pricing?.finalPrice ?? 0) || 0;

        // Cập nhật reference trong customers.serviceDetails[] và lifetime_revenue (1️⃣ đơn chưa duyệt → đã duyệt: lifetime_revenue += order.total)
        const db = mongoose.connection.db;
        const customersCollection = db.collection(Customer.collection.name);
        const approveUpdate = {
            $set: {
                'serviceDetails.$.approvalStatus': 'approved'
            }
        };
        if (orderTotal > 0) {
            approveUpdate.$inc = { lifetime_revenue: orderTotal };
        }
        await customersCollection.updateOne(
            { 
                _id: new mongoose.Types.ObjectId(customerId),
                'serviceDetails.serviceDetailId': new mongoose.Types.ObjectId(serviceDetailId)
            },
            approveUpdate
        );

        const customer = await Customer.findById(customerId);
        if (!customer) return { success: false, error: 'Không tìm thấy khách hàng.' };

        const newPipeline = pipelineFromServiceStatus(serviceDetail.status);
        await Customer.updateOne(
            { _id: customerId },
            {
                $set: {
                    'pipelineStatus.0': newPipeline,
                    'pipelineStatus.6': newPipeline,
                },
            }
        );

        await pushCareLog(
            customerId,
            `[Duyệt đơn chốt] #${serviceDetailId} (status: ${serviceDetail.status})`,
            session.id
        );

        revalidateData();
        return { success: true, message: 'Đã duyệt đơn thành công.' };
    } catch (e) {
        console.error('[approveServiceDetailAction] error:', e);
        return { success: false, error: 'Lỗi server khi duyệt đơn.' };
    }
}

/* ============================================================
 * APPROVE DEAL (legacy-compatible): dùng serviceDetailId
 * ============================================================ */
export async function approveServiceDealAction(prevState, formData) {
    const session = await checkAuthToken();
    if (!session?.id) return { success: false, error: 'Yêu cầu đăng nhập.' };

    const customerId = String(formData.get('customerId') || '');
    const serviceDetailId = String(formData.get('serviceDetailId') || '');

    const listPrice = Number(formData.get('listPrice') || 0);
    const discountType = String(formData.get('discountType') || 'none');
    const discountValue = Number(formData.get('discountValue') || 0);
    const finalPrice = Number(formData.get('finalPrice') || 0);
    const revenue = Number(formData.get('revenue') || 0);
    const notes = String(formData.get('notes') || '');

    let commissions = [];
    let costs = [];
    try {
        commissions = JSON.parse(formData.get('commissions') || '[]');
        costs = JSON.parse(formData.get('costs') || '[]');
    } catch (_) { }

    if (!isValidObjectId(customerId) || !isValidObjectId(serviceDetailId)) {
        return { success: false, error: 'Thiếu hoặc sai customerId/serviceDetailId.' };
    }

    try {
        await connectDB();
        
        // Tìm trong service_details collection
        const serviceDetail = await ServiceDetail.findById(serviceDetailId);
        if (!serviceDetail) {
            return { success: false, error: 'Không tìm thấy đơn chốt dịch vụ.' };
        }
        
        // Kiểm tra customerId có khớp không
        if (String(serviceDetail.customerId) !== String(customerId)) {
            return { success: false, error: 'Đơn chốt dịch vụ không thuộc khách hàng này.' };
        }
        
        if (serviceDetail.approvalStatus === 'approved') {
            return { success: false, error: 'Đơn đã duyệt trước đó.' };
        }

        // Cập nhật pricing theo form duyệt trong service_details collection
        serviceDetail.notes = notes;
        
        // ✅ Revenue: Ưu tiên giá từ form, nhưng nếu revenue = listPrice (giá gốc) thì dùng finalPrice (giá sau giảm)
        // Đảm bảo revenue = giá sau giảm, không phải giá gốc
        let revenueValue = 0;
        if (Number.isFinite(revenue) && revenue > 0) {
            // Nếu revenue từ form = listPrice (có thể là giá gốc), thì dùng finalPrice thay thế
            if (Number(revenue) === Number(listPrice) && Number(finalPrice) > 0 && Number(finalPrice) !== Number(listPrice)) {
                revenueValue = finalPrice;
            } else {
                revenueValue = revenue;
            }
        } else if (Number.isFinite(finalPrice) && finalPrice > 0) {
            revenueValue = finalPrice;
        } else {
            revenueValue = listPrice;
        }
        serviceDetail.revenue = revenueValue;
        
        serviceDetail.pricing = {
            listPrice,
            discountType: ['none', 'amount', 'percent'].includes(discountType) ? discountType : 'none',
            discountValue,
            adjustmentType: serviceDetail.pricing?.adjustmentType || 'none',
            adjustmentValue: serviceDetail.pricing?.adjustmentValue || 0,
            finalPrice,
        };
        serviceDetail.commissions = (Array.isArray(commissions) ? commissions : []).map((x) => ({
            user: x.user,
            role: x.role,
            percent: Number(x.percent) || 0,
            amount: Number(x.amount) || 0,
        }));
        
        // ✅ Costs: Chỉ lưu nếu có dữ liệu, nếu không thì để mảng rỗng (không lưu undefined)
        if (Array.isArray(costs) && costs.length > 0) {
            serviceDetail.costs = costs.map((x) => ({
                label: x.label || '',
                amount: Number(x.amount) || 0,
                createdAt: x.createdAt || new Date(),
                createdBy: x.createdBy || session.id,
            }));
        } else {
            serviceDetail.costs = []; // Đảm bảo là mảng rỗng, không phải undefined
        }
        
        // ✅ Loại bỏ các thuộc tính không cần thiết nếu rỗng để giảm kích thước document
        // payments: Chỉ giữ nếu có dữ liệu
        if (!serviceDetail.payments || !Array.isArray(serviceDetail.payments) || serviceDetail.payments.length === 0) {
            serviceDetail.payments = [];
        }
        
        // interestedServices: Chỉ giữ nếu có dữ liệu
        if (!serviceDetail.interestedServices || !Array.isArray(serviceDetail.interestedServices) || serviceDetail.interestedServices.length === 0) {
            serviceDetail.interestedServices = [];
        }

        // Approve - đảm bảo status là 'completed' khi approve
        serviceDetail.approvalStatus = 'approved';
        serviceDetail.status = 'completed'; // Đảm bảo status là completed khi approve
        serviceDetail.approvedBy = session.id;
        serviceDetail.approvedAt = new Date();
        const approvedAt = new Date();

        await serviceDetail.save();

        // Cập nhật reference trong customers.serviceDetails[]
        const db = mongoose.connection.db;
        const customersCollection = db.collection(Customer.collection.name);
        await customersCollection.updateOne(
            { 
                _id: new mongoose.Types.ObjectId(customerId),
                'serviceDetails.serviceDetailId': new mongoose.Types.ObjectId(serviceDetailId)
            },
            {
                $set: {
                    'serviceDetails.$.approvalStatus': 'approved'
                }
            }
        );

        const customer = await Customer.findById(customerId);
        if (!customer) return { success: false, error: 'Không tìm thấy khách hàng.' };

        // ========== XỬ LÝ THEO THIẾT KẾ MỚI: orders + report_daily ==========
        // Tính toán cost và profit
        const totalCost = (Array.isArray(serviceDetail.costs) ? serviceDetail.costs : []).reduce(
            (sum, c) => sum + (Number(c.amount) || 0),
            0
        );
        const profit = Math.max(0, revenue - totalCost);

        // Bước 1: Xác định new/old customer (atomic)
        // Nếu update thành công với điều kiện total_completed_orders = 0 → khách mới
        // Nếu không match → khách cũ
        const isNewCustomerResult = await customersCollection.findOneAndUpdate(
            {
                _id: new mongoose.Types.ObjectId(customerId),
                total_completed_orders: 0
            },
            {
                $inc: { total_completed_orders: 1 }
            },
            { returnDocument: 'after' }
        );
        
        const isNewCustomer = !!isNewCustomerResult;
        
        // Nếu không phải khách mới, update total_completed_orders
        if (!isNewCustomer) {
            await customersCollection.updateOne(
                { _id: new mongoose.Types.ObjectId(customerId) },
                { $inc: { total_completed_orders: 1 } }
            );
        }

        // Bước 2: Cập nhật lifetime_revenue
        // ✅ Sử dụng revenueValue (đã được tính đúng) thay vì revenue từ form
        await customersCollection.updateOne(
            { _id: new mongoose.Types.ObjectId(customerId) },
            { $inc: { lifetime_revenue: revenueValue } }
        );

        // Bước 3: Tạo order trong collection orders
        // ✅ Sử dụng revenueValue (đã được tính đúng ở trên) thay vì revenue từ form
        const order = new Order({
            customerId: new mongoose.Types.ObjectId(customerId),
            serviceId: serviceDetail.serviceId,
            serviceDetailId: new mongoose.Types.ObjectId(serviceDetailId),
            sourceId: serviceDetail.sourceId,
            sourceDetails: serviceDetail.sourceDetails || '',
            price: finalPrice, // Giá sau giảm
            revenue: revenueValue, // Doanh thu ghi nhận (ưu tiên từ form, nếu không thì dùng finalPrice)
            cost: totalCost,
            profit: profit,
            status: 'completed',
            completedAt: approvedAt,
            createdAt: serviceDetail.createdAt || new Date(),
            approvedBy: session.id,
            approvedAt: approvedAt,
        });
        await order.save();

        // Sau khi đơn chuyển sang completed/approved → tính lại báo cáo tài chính (tháng + daily)
        try {
            const year = approvedAt.getFullYear();
            const month = approvedAt.getMonth() + 1;
            await rebuildFinancialReportForMonth(year, month);
            const dateStr = approvedAt.toISOString().slice(0, 10);
            await rebuildFinancialReportDailyForDateRange(dateStr, dateStr);
        } catch (e) {
            console.error('[financialReports] rebuild after approve failed:', e?.message || e);
        }

        // Bước 4: Update report_daily (atomic với $inc)
        // Format date string: "YYYY-MM-DD"
        const dateStr = approvedAt.toISOString().split('T')[0];
        const dateObj = new Date(approvedAt);
        dateObj.setUTCHours(0, 0, 0, 0);

        // Build update object với $inc
        // ✅ Sử dụng revenueValue (đã được tính đúng) thay vì revenue từ form
        const updateFields = {
            $inc: {
                total_completed_orders: 1,
                total_revenue: revenueValue,
                total_cost: totalCost,
                total_profit: profit,
                total_new_customers: isNewCustomer ? 1 : 0,
                total_old_customers: isNewCustomer ? 0 : 1,
            }
        };

        // Thêm revenue_by_source nếu có sourceId (dùng dot notation cho Map)
        if (serviceDetail.sourceId) {
            const sourceIdStr = String(serviceDetail.sourceId);
            updateFields.$inc[`revenue_by_source.${sourceIdStr}`] = revenueValue;
        }

        // Thêm revenue_by_service (dùng dot notation cho Map)
        if (serviceDetail.serviceId) {
            const serviceIdStr = String(serviceDetail.serviceId);
            updateFields.$inc[`revenue_by_service.${serviceIdStr}`] = revenueValue;
        }

        // Update report_daily với upsert
        // Sử dụng findOneAndUpdate với upsert để đảm bảo tạo document mới nếu chưa có
        await ReportDaily.findOneAndUpdate(
            { _id: dateStr },
            {
                $set: { date: dateObj },
                $inc: updateFields.$inc
            },
            { upsert: true, new: true }
        );

        const newPipeline = pipelineFromServiceStatus(serviceDetail.status);
        // Kiểm tra xem có nên cập nhật không (chỉ cập nhật nếu step mới > step hiện tại)
        const validatedPipeline = validatePipelineStatusUpdate(customer, newPipeline);
        if (validatedPipeline) {
            customer.pipelineStatus = customer.pipelineStatus || [];
            customer.pipelineStatus[0] = validatedPipeline;
            customer.pipelineStatus[6] = validatedPipeline;
            await customer.save();
        }

        try {
            const { default: initAgenda } = await import('@/config/agenda');
            const agenda = await initAgenda();
            const sendAt = new Date(Date.now() + 60 * 60 * 1000); // đổi thời gian gửi tin nhắn trước phẫu thuật thành 1 giờ sau khi duyệt đơn
            // const sendAt = new Date(Date.now() + 60 * 1000); // 1 phút sau khi duyệt đơn// đổi thời gian gửi tin nhắn trước phẫu thuật thành  khi duyệt đơn
            
            await agenda.schedule(sendAt, 'servicePreSurgeryMessage', {
                customerId,
                serviceDetailId,
                triggeredBy: session.id,
            });
        } catch (scheduleError) {
            console.error('[approveServiceDealAction] Lỗi khi schedule gửi tin nhắn trước phẫu thuật:', scheduleError);
            await pushCareLog(
                customerId,
                `[Auto] Không thể schedule tin nhắn trước phẫu thuật: ${scheduleError?.message || scheduleError}`,
                session.id
            );
        }

        await pushCareLog(
            customerId,
            `Admin duyệt đơn chốt #${serviceDetailId} (revenue: ${Number(revenue).toLocaleString('vi-VN')}đ).`,
            session.id
        );

        revalidateData();
        return { success: true, message: 'Đã duyệt đơn thành công.' };
    } catch (e) {
        console.error('[approveServiceDealAction] error:', e);
        return { success: false, error: 'Lỗi server khi duyệt đơn.' };
    }
}


// ============= REJECT DEAL (legacy-compatible) =============
export async function rejectServiceDealAction(prevState, formData) {
    const session = await checkAuthToken();
    if (!session?.id) return { success: false, error: 'Yêu cầu đăng nhập.' };

    const customerId = String(formData.get('customerId') || '');
    const serviceDetailId = String(formData.get('serviceDetailId') || '');
    const reason = String(formData.get('reason') || '');

    if (!isValidObjectId(customerId) || !isValidObjectId(serviceDetailId)) {
        return { success: false, error: 'Thiếu hoặc sai customerId/serviceDetailId.' };
    }

    try {
        await connectDB();

        // Hành vi reject theo yêu cầu mới:
        // - Không có trạng thái "rejected" trong approvalStatus
        // - Ta coi reject là HỦY đơn pending (xóa item) + cập nhật pipeline rejected
        const customer = await Customer.findById(customerId).lean();
        const newRejectedStatus = 'rejected_after_consult_6';
        const validatedRejectedStatus = validatePipelineStatusUpdate(customer, newRejectedStatus);
        
        const updateData = {
            $pull: {
                serviceDetails: {
                    _id: new mongoose.Types.ObjectId(serviceDetailId),
                    approvalStatus: 'pending',
                },
            },
        };
        
        // Chỉ cập nhật pipelineStatus nếu step mới > step hiện tại
        if (validatedRejectedStatus) {
            updateData.$set = {
                'pipelineStatus.0': validatedRejectedStatus,
                'pipelineStatus.6': validatedRejectedStatus,
            };
        }
        
        const res = await Customer.updateOne(
            { _id: customerId },
            updateData
        );

        if (res.modifiedCount === 0) {
            return {
                success: false,
                error:
                    'Không thể từ chối: đơn không ở trạng thái pending hoặc không tồn tại.',
            };
        }

        await pushCareLog(
            customerId,
            `Admin từ chối đơn chốt #${serviceDetailId}${reason ? `: ${reason}` : ''}.`,
            session.id
        );

        revalidateData();
        return { success: true, message: 'Đã từ chối đơn.' };
    } catch (e) {
        console.error('[rejectServiceDealAction] error:', e);
        return { success: false, error: 'Lỗi server khi từ chối đơn.' };
    }
}
