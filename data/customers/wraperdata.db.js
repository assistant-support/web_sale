'use server';

import { revalidateTag } from 'next/cache';
import mongoose from 'mongoose';
import Customer from '@/models/customer.model';
import Service from '@/models/services.model';
import Logs from '@/models/log.model';
import Zalo from '@/models/zalo.model';
import { ZaloAccount as ZaloAccountNew } from '@/models/zalo-account.model';
import { uploadFileToDrive } from '@/function/drive/image';
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

            courseSnapshot = {
                name: course.name,
                description: course.description,
                costs: course.costs,
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

        if (!Array.isArray(customerDoc.serviceDetails)) {
            customerDoc.serviceDetails = [];
        }

        // 6. Tạo object service detail mới
        const newServiceDetail = {
            approvalStatus: 'pending',
            status: status,
            revenue: finalPrice, // Doanh thu chính là giá cuối cùng
            invoiceDriveIds: uploadedFileIds, // Lưu mảng ID ảnh
            customerPhotosDriveIds: uploadedCustomerPhotoIds, // Lưu mảng ID ảnh khách hàng
            notes: notes || '',
            closedAt: new Date(),
            closedBy: session.id,
            selectedService: selectedServiceId || null,
            selectedCourse: courseSnapshot,
            pricing: {
                listPrice: listPrice,
                discountType: discountType,
                discountValue: discountValue,
                adjustmentType: adjustmentType,
                adjustmentValue: adjustmentValue,
                finalPrice: finalPrice,
            },
        };

        customerDoc.serviceDetails.push(newServiceDetail);

        // 7. Cập nhật pipeline
        const newPipelineStatus = pipelineFromServiceStatus(status);
        if (newPipelineStatus) {
            // Kiểm tra xem có nên cập nhật không (chỉ cập nhật nếu step mới > step hiện tại)
            const validatedStatus = validatePipelineStatusUpdate(customerDoc, newPipelineStatus);
            if (validatedStatus) {
                customerDoc.pipelineStatus = customerDoc.pipelineStatus || [];
                customerDoc.pipelineStatus[6] = validatedStatus; // Giả sử step 6
            }
        }

        // 8. Ghi care log
        const logContent = `[Chốt dịch vụ] Trạng thái: ${status}. ${selectedCourseName ? `Liệu trình: ${selectedCourseName}. ` : ''}Ghi chú: ${notes || 'Không có'}`;
        customerDoc.care = customerDoc.care || [];
        customerDoc.care.push({ content: logContent, createBy: session.id, createAt: new Date(), step: 6 });

        // 9. Lưu vào DB
        await customerDoc.save();

        // 10. Schedule gửi tin nhắn trước phẫu thuật (chỉ khi status !== 'rejected' và có selectedService + selectedCourse)
        if (status !== 'rejected' && selectedServiceId && selectedCourseName) {
            try {
                console.log(`[closeServiceAction] 🚀 Bắt đầu schedule tin nhắn trước phẫu thuật cho customerId: ${customerId}, selectedServiceId: ${selectedServiceId}, selectedCourseName: ${selectedCourseName}`);
                
                // Lấy _id của serviceDetail vừa tạo
                const savedCustomer = await Customer.findById(customerId);
                if (!savedCustomer || !savedCustomer.serviceDetails || savedCustomer.serviceDetails.length === 0) {
                    console.error('[closeServiceAction] ❌ Không tìm thấy serviceDetail vừa tạo');
                    return { success: true, message: 'Chốt dịch vụ thành công! Đơn đang chờ duyệt.' };
                }
                
                const newDetail = savedCustomer.serviceDetails[savedCustomer.serviceDetails.length - 1];
                const serviceDetailId = newDetail._id;
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
            console.log(`[closeServiceAction] ⏭️ Bỏ qua schedule tin nhắn trước phẫu thuật. status: ${status}, selectedServiceId: ${selectedServiceId}, selectedCourseName: ${selectedCourseName}`);
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

        const customer = await Customer.findById(customerId);
        if (!customer) return { success: false, error: 'Không tìm thấy khách hàng.' };

        const detail = customer.serviceDetails?.id(serviceDetailId);
        if (!detail) return { success: false, error: 'Không tìm thấy đơn chốt dịch vụ.' };
        if (detail.approvalStatus === 'approved') {
            return { success: false, error: 'Đơn đã duyệt. Không thể chỉnh sửa.' };
        }

        // Cập nhật các field cơ bản
        if (typeof statusRaw !== 'undefined') detail.status = statusRaw;
        if (typeof notes !== 'undefined') detail.notes = notes;
        if (typeof selectedService !== 'undefined') detail.selectedService = selectedService;

        // Cập nhật pricing nếu có
        if (
            typeof listPrice !== 'undefined' ||
            typeof discountType !== 'undefined' ||
            typeof discountValue !== 'undefined' ||
            typeof adjustmentType !== 'undefined' ||
            typeof adjustmentValue !== 'undefined' ||
            typeof finalPrice !== 'undefined'
        ) {
            const current = detail.pricing || {};
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

            detail.pricing = next;
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
                detail.invoiceDriveIds = [...existingIds, ...uploaded];
            } else {
                // Nếu không có existingIds, lấy từ detail hiện tại và lọc bỏ ID đã xóa
                const currentIds = (detail.invoiceDriveIds || []).filter(id => !deletedImageIds.includes(id));
                detail.invoiceDriveIds = [...currentIds, ...uploaded];
            }
        } else {
            // Chỉ sắp xếp lại mà không thêm ảnh mới
            if (existingIds.length > 0) {
                // Có existingIds: dùng danh sách đã được lọc (đã xóa ID cần xóa)
                detail.invoiceDriveIds = existingIds;
            } else if (deletedImageIds.length > 0) {
                // Không có existingIds nhưng có ID cần xóa: xóa khỏi danh sách hiện tại
                detail.invoiceDriveIds = (detail.invoiceDriveIds || []).filter(id => !deletedImageIds.includes(id));
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
                    detail.customerPhotosDriveIds = [...existingCustomerPhotoIds, ...uploaded];
                } else {
                    // Nếu không có existingCustomerPhotoIds, lấy từ detail hiện tại và lọc bỏ ID đã xóa
                    const currentIds = (detail.customerPhotosDriveIds || []).filter(id => !deletedCustomerPhotoIds.includes(id));
                    detail.customerPhotosDriveIds = [...currentIds, ...uploaded];
                }
            }
        } else {
            // Chỉ sắp xếp lại mà không thêm ảnh mới
            if (existingCustomerPhotoIds.length > 0) {
                // Có existingCustomerPhotoIds: dùng danh sách đã được lọc (đã xóa ID cần xóa)
                detail.customerPhotosDriveIds = existingCustomerPhotoIds;
            } else if (deletedCustomerPhotoIds.length > 0) {
                // Không có existingCustomerPhotoIds nhưng có ID cần xóa: xóa khỏi danh sách hiện tại
                detail.customerPhotosDriveIds = (detail.customerPhotosDriveIds || []).filter(id => !deletedCustomerPhotoIds.includes(id));
            }
            // Nếu không có existingCustomerPhotoIds và không có ID cần xóa: giữ nguyên
        }

        // Lưu subdoc
        await customer.save();

        // Cập nhật pipeline theo status hiện tại của detail
        const finalStatus = detail.status;
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
            `[Sửa đơn chốt] #${serviceDetailId} ${statusRaw ? `(status → ${finalStatus})` : ''}${notes ? ` | Ghi chú: ${notes}` : ''
            }`,
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

        // Chỉ xóa khi approvalStatus = 'pending'
        const res = await Customer.updateOne(
            { _id: customerId },
            {
                $pull: {
                    serviceDetails: {
                        _id: new mongoose.Types.ObjectId(serviceDetailId),
                        approvalStatus: 'pending',
                    },
                },
            }
        );

        if (res.modifiedCount === 0) {
            return {
                success: false,
                error: 'Không thể xóa: đơn không ở trạng thái pending hoặc không tồn tại.',
            };
        }

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
        const customer = await Customer.findById(customerId);
        if (!customer) return { success: false, error: 'Không tìm thấy khách hàng.' };

        const detail = customer.serviceDetails?.id(serviceDetailId);
        if (!detail) return { success: false, error: 'Không tìm thấy đơn chốt dịch vụ.' };
        if (detail.approvalStatus === 'approved')
            return { success: false, error: 'Đơn đã duyệt trước đó.' };

        detail.approvalStatus = 'approved';
        detail.approvedBy = session.id;
        detail.approvedAt = new Date();

        await customer.save();

        const newPipeline = pipelineFromServiceStatus(detail.status);
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
            `[Duyệt đơn chốt] #${serviceDetailId} (status: ${detail.status})`,
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
        const customer = await Customer.findById(customerId);
        if (!customer) return { success: false, error: 'Không tìm thấy khách hàng.' };

        const detail = customer.serviceDetails?.id(serviceDetailId);
        if (!detail) return { success: false, error: 'Không tìm thấy đơn chốt dịch vụ.' };
        if (detail.approvalStatus === 'approved')
            return { success: false, error: 'Đơn đã duyệt trước đó.' };

        // cập nhật pricing theo form duyệt
        detail.notes = notes;
        detail.revenue = Number.isFinite(revenue) ? revenue : 0;
        detail.pricing = {
            listPrice,
            discountType: ['none', 'amount', 'percent'].includes(discountType) ? discountType : 'none',
            discountValue,
            finalPrice,
        };
        detail.commissions = (Array.isArray(commissions) ? commissions : []).map((x) => ({
            user: x.user,
            role: x.role,
            percent: Number(x.percent) || 0,
            amount: Number(x.amount) || 0,
        }));
        detail.costs = (Array.isArray(costs) ? costs : []).map((x) => ({
            label: x.label,
            amount: Number(x.amount) || 0,
        }));

        // Approve
        detail.approvalStatus = 'approved';
        detail.approvedBy = session.id;
        detail.approvedAt = new Date();

        const detailSnapshot = detail.toObject ? detail.toObject() : JSON.parse(JSON.stringify(detail));

        await customer.save();

        const newPipeline = pipelineFromServiceStatus(detail.status);
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
