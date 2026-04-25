'use server';

import { revalidateTag } from 'next/cache';
import mongoose from 'mongoose';
import connectDB from '@/config/connectDB';
import checkAuthToken from '@/utils/checktoken';
import { uploadFileToDrive } from '@/function/drive/image';

import Call from '@/models/call.model';
import Customer from '@/models/customer.model';
import Appointment from '@/models/appointment.model';

import { getCallsAll, getCallsByCustomer } from './handledata.db';
import { revalidateData } from '@/app/actions/customer.actions';

/**
 * API lấy dữ liệu (dùng file data đã cache)
 * @param {{ customerId?: string }} params
 */
export async function call_data(params = {}) {
  const { customerId } = params || {};
  if (customerId) {
    return await getCallsByCustomer(customerId);
  }
  return await getCallsAll();
}

/**
 * Revalidate toàn bộ cache calls
 */
export async function reloadCalls() {
  revalidateTag('calls');
}

/**
 * Revalidate cache calls theo customer
 */
export async function reloadCallsByCustomer(customerId) {
  revalidateTag('calls');
  if (customerId) revalidateTag(`calls:${customerId}`);
}

function sipToCallStatus(sipCode, durationSec) {
  // Nếu có thời lượng > 0 thì coi là completed
  if (Number(durationSec) > 0) return 'completed';
  const code = Number(sipCode) || 0;
  if (code === 486) return 'busy';         // Busy Here
  if (code === 603) return 'rejected';     // Decline
  if (code === 480) return 'no_answer';    // Temporarily Unavailable
  if (code === 408) return 'no_answer';    // Request Timeout
  if (code === 487) return 'missed';       // Request Terminated (caller cancel)
  if (code >= 500) return 'failed';
  if (code >= 400) return 'failed';
  return 'failed';
}

export async function saveCallAction(prevState, formData) {
  const session = await checkAuthToken();
  if (!session?.id) {
    return { success: false, error: 'Yêu cầu đăng nhập.' };
  }

  const customerId = formData.get('customerId');
  const userId = formData.get('userId');          // 🔴 BẮT BUỘC có
  const crmStatus = formData.get('crmStatus') || ''; // ✅ trạng thái Step 4 từ popup
  // Cho phép UI truyền 'callStatus' (đúng enum) hoặc 'status' cũ:
  let callStatus = formData.get('callStatus') || formData.get('status') || '';
  const duration = Number(formData.get('duration') || 0);           // ✅ SỐ GIÂY
  const startTime = formData.get('startTime') ? new Date(formData.get('startTime')) : new Date();
  const sipStatusCode = Number(formData.get('sipStatusCode') || 0);
  const labelFU = String(formData.get('label_FU') || '').trim();

  const recordingFile = formData.get('recordingFile');
  const recordingFileName = formData.get('recordingFileName') || '';

  if (!customerId || !userId) {
    return { success: false, error: 'Thiếu customerId hoặc userId.' };
  }
  if (!recordingFile || recordingFile.size === 0) {
    return { success: false, error: 'Thiếu file ghi âm cuộc gọi.' };
  }

  try {
    await connectDB();

    // 1) Upload audio lên Drive
    const folderId = '1-pN5irPRLbiBhwER4O1tNhYzMllpga-v';
    const uploadedFile = await uploadFileToDrive(recordingFile, folderId);
    if (!uploadedFile?.id) {
      throw new Error('Tải file ghi âm lên Drive thất bại.');
    }

    // 2) Nội suy callStatus nếu UI chưa gửi đúng enum
    if (!callStatus) {
      callStatus = sipToCallStatus(sipStatusCode, duration);
    }

    // 3) Tạo Call
    const newCall = await Call.create({
      customer: new mongoose.Types.ObjectId(customerId),
      user: new mongoose.Types.ObjectId(userId),
      file: uploadedFile.id,
      createdAt: startTime,
      duration,
      status: callStatus,
      label_FU: labelFU,
    });

    // 4) Ghi care Step 4 vào Customer
    const callTimeStr = startTime.toLocaleString('vi-VN');
    const audioLink = uploadedFile.webViewLink || '';
    const lines = [
      `Cuộc gọi lúc ${callTimeStr}`,
      `• Trạng thái cuộc gọi: ${callStatus}`,
      `• Thời lượng: ${duration}s`,
      `• Ghi âm: ${audioLink || `fileId=${uploadedFile.id}`}`,
    ];
    if (crmStatus) lines.unshift(`KQ sau gọi (Step 4): ${crmStatus}`);
    const careNote = {
      content: lines.join(' — '),
      createBy: session.id,
      createAt: new Date(),
      step: 4
    };
    await Customer.findByIdAndUpdate(customerId, { $push: { care: careNote } });

    // 5) Revalidate
    revalidateTag('calls');
    revalidateTag(`calls:${customerId}`);
    revalidateData()
    return {
      success: true,
      message: 'Lưu cuộc gọi thành công!',
      callId: String(newCall._id),
      driveFileId: uploadedFile.id,
      webViewLink: uploadedFile.webViewLink || null,
      fileName: recordingFileName || null
    };
  } catch (error) {
    console.error('Lỗi khi lưu cuộc gọi:', error);
    return { success: false, error: `Đã xảy ra lỗi phía máy chủ: ${error.message}` };
  }
}

export async function updateLatestRecordedCallLabelFUAction(customerId, labelFU = '') {
  const session = await checkAuthToken();
  if (!session?.id) {
    return { success: false, error: 'Yêu cầu đăng nhập.' };
  }
  if (!customerId) {
    return { success: false, error: 'Thiếu customerId.' };
  }

  const normalizedLabel = String(labelFU || '').trim();
  if (!normalizedLabel) {
    return { success: true, noChange: true };
  }

  try {
    await connectDB();
    const latestCall = await Call.findOne({
      customer: new mongoose.Types.ObjectId(customerId),
      file: { $exists: true, $ne: '' },
    }).sort({ createdAt: -1, _id: -1 });

    if (!latestCall) {
      return { success: true, noChange: true };
    }

    latestCall.label_FU = normalizedLabel;
    await latestCall.save();

    revalidateTag('calls');
    revalidateTag(`calls:${customerId}`);
    return { success: true, callId: String(latestCall._id) };
  } catch (error) {
    console.error('Lỗi khi cập nhật label_FU cho call:', error);
    return { success: false, error: `Đã xảy ra lỗi phía máy chủ: ${error.message}` };
  }
}

export async function updateCallLabelFUByIdAction(callId, labelFU = '') {
  const session = await checkAuthToken();
  if (!session?.id) {
    return { success: false, error: 'Yêu cầu đăng nhập.' };
  }
  if (!callId) {
    return { success: false, error: 'Thiếu callId.' };
  }

  const normalizedLabel = String(labelFU || '').trim();
  if (!normalizedLabel) {
    return { success: true, noChange: true };
  }

  try {
    await connectDB();
    const updated = await Call.findByIdAndUpdate(
      callId,
      { $set: { label_FU: normalizedLabel } },
      { new: true }
    );
    if (!updated) {
      return { success: false, error: 'Không tìm thấy cuộc gọi.' };
    }

    revalidateTag('calls');
    revalidateTag(`calls:${updated.customer}`);
    return { success: true, callId: String(updated._id) };
  } catch (error) {
    console.error('Lỗi khi cập nhật label_FU theo callId:', error);
    return { success: false, error: `Đã xảy ra lỗi phía máy chủ: ${error.message}` };
  }
}

export async function appendCustomerFUAction(customerId, label = '') {
  const session = await checkAuthToken();
  if (!session?.id) {
    return { success: false, error: 'Yêu cầu đăng nhập.' };
  }

  if (!customerId) {
    return { success: false, error: 'Thiếu customerId.' };
  }

  try {
    await connectDB();

    const customerDoc = await Customer.findById(customerId).select('FU statusForCall');
    if (!customerDoc) {
      return { success: false, error: 'Không tìm thấy khách hàng.' };
    }

    const currentFU = Array.isArray(customerDoc.FU) ? [...customerDoc.FU] : [];

    // Chọn FU theo thứ tự FU1 -> FU2 -> FU3.
    // Sau khi đã có FU3, các lần sau chỉ cập nhật FU3 (không push phần tử FU mới).
    // Đồng thời đảm bảo 1 ngày chỉ tạo tối đa 1 phần tử FU mới:
    // nếu day_start của phần tử FU cuối cùng cùng ngày hiện tại -> không tạo thêm FU.
    const fuIndexMap = { FU1: -1, FU2: -1, FU3: -1 };
    currentFU.forEach((item, idx) => {
      if (!item || typeof item !== 'object') return;
      ['FU1', 'FU2', 'FU3'].forEach((key) => {
        if (Object.prototype.hasOwnProperty.call(item, key) && fuIndexMap[key] === -1) {
          fuIndexMap[key] = idx;
        }
      });
    });

    const now = new Date();
    const isSameDay = (a, b) => (
      a.getFullYear() === b.getFullYear()
      && a.getMonth() === b.getMonth()
      && a.getDate() === b.getDate()
    );

    // Tìm phần tử FU cuối cùng trong mảng
    let lastFUInfo = null;
    for (let i = currentFU.length - 1; i >= 0; i -= 1) {
      const item = currentFU[i];
      if (!item || typeof item !== 'object') continue;
      const key = ['FU3', 'FU2', 'FU1'].find((k) => Object.prototype.hasOwnProperty.call(item, k));
      if (key) {
        lastFUInfo = { index: i, key, payload: item[key] || {} };
        break;
      }
    }

    let targetKey = 'FU1';
    let targetIndex = -1;
    let shouldCreateNewFU = true;

    if (lastFUInfo) {
      const lastDayStartRaw = lastFUInfo.payload?.day_start;
      const lastDayStart = lastDayStartRaw ? new Date(lastDayStartRaw) : null;
      const lastDayIsValid = lastDayStart instanceof Date && !Number.isNaN(lastDayStart.getTime());

      if (lastDayIsValid && isSameDay(lastDayStart, now)) {
        // Cùng ngày với FU cuối -> không tạo FU mới
        targetKey = lastFUInfo.key;
        targetIndex = lastFUInfo.index;
        shouldCreateNewFU = false;
      }
    }

    if (shouldCreateNewFU) {
      if (fuIndexMap.FU1 === -1) {
        targetKey = 'FU1';
      } else if (fuIndexMap.FU2 === -1) {
        targetKey = 'FU2';
      } else if (fuIndexMap.FU3 === -1) {
        targetKey = 'FU3';
      } else {
        // Đã có FU3 thì không tạo thêm phần tử mới
        targetKey = 'FU3';
        shouldCreateNewFU = false;
      }
      targetIndex = fuIndexMap[targetKey];
    }

    if (shouldCreateNewFU || targetIndex === -1) {
      const fuEntry = {
        [targetKey]: {
          day_start: now,
        },
      };
      currentFU.push(fuEntry);
    } else {
      const existingEntry = currentFU[targetIndex] || {};
      const existingPayload = (existingEntry && typeof existingEntry === 'object' ? existingEntry[targetKey] : null) || {};
      currentFU[targetIndex] = {
        ...existingEntry,
        [targetKey]: {
          day_start: existingPayload?.day_start || now,
        },
      };
    }

    customerDoc.FU = currentFU;
    const hasFU3AfterUpdate = currentFU.some((item) =>
      item && typeof item === 'object' && Object.prototype.hasOwnProperty.call(item, 'FU3')
    );
    const hasAppointment = await Appointment.exists({ customer: customerId });

    if (hasAppointment) {
      customerDoc.statusForCall = 'success';
    } else if (hasFU3AfterUpdate && customerDoc.statusForCall === 'await') {
      customerDoc.statusForCall = 'false';
    }

    customerDoc.markModified('FU');
    await customerDoc.save();

    revalidateData();
    return {
      success: true,
      key: targetKey,
      noChange: false,
    };
  } catch (error) {
    console.error('Lỗi khi thêm FU:', error);
    return { success: false, error: `Đã xảy ra lỗi phía máy chủ: ${error.message}` };
  }
}