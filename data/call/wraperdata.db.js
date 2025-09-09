'use server';

import { revalidateTag } from 'next/cache';
import mongoose from 'mongoose';
import connectDB from '@/config/connectDB';
import checkAuthToken from '@/utils/checktoken';
import { uploadFileToDrive } from '@/function/drive/image';

import Call from '@/models/call.model';
import Customer from '@/models/customer.model';

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
    const folderId = '1Dp95BcDzOPKVIU4sIEKkZGtJPCEbWyRO';
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
      status: callStatus
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