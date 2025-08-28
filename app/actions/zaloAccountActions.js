// File: app/actions/zaloAccountActions.js
"use server";

import connectDB from "@/config/connectDB";
import ZaloAccount from "@/models/zalo";
import User from "@/models/users";
import { revalidatePath } from "next/cache";
import { revalidateAndBroadcast } from "@/lib/revalidation";

/**
 * Lấy tất cả tài khoản Zalo. Hỗ trợ cả phân trang và lấy tất cả.
 * @param {object} options - Tùy chọn truy vấn.
 * @param {number} [options.page=1] - Trang hiện tại.
 * @param {number} [options.limit=0] - Số lượng mục mỗi trang. Nếu limit = 0, lấy tất cả.
 */
// ** MODIFIED: Cập nhật lại toàn bộ hàm để linh hoạt hơn
export async function getZaloAccounts({ page = 1, limit = 0 } = {}) {
  try {
    await connectDB();

    const query = ZaloAccount.find({})
      .populate("users", "name email phone role")
      .sort({ createdAt: -1 });

    // ++ ADDED: Chỉ áp dụng phân trang nếu limit > 0
    if (limit > 0) {
      const skip = (page - 1) * limit;
      query.skip(skip).limit(limit);
    }

    const [accounts, total] = await Promise.all([
      query.lean(),
      ZaloAccount.countDocuments({}),
    ]);

    return {
      success: true,
      data: JSON.parse(JSON.stringify(accounts)),
      // Pagination chỉ có ý nghĩa khi có limit
      pagination:
        limit > 0
          ? { page, limit, total, totalPages: Math.ceil(total / limit) }
          : {},
    };
  } catch (error) {
    console.error("Lỗi khi lấy danh sách tài khoản Zalo:", error);
    return { success: false, error: error.message, data: [], pagination: {} };
  }
}

/**
 * Lấy tất cả user trong hệ thống (để gán quyền).
 * @returns {Promise<Array>} Mảng các user.
 */
export async function getAllUsers() {
  try {
    await connectDB();
    const users = await User.find({}).select("name email phone role").lean(); // Lấy thêm phone và role
    return JSON.parse(JSON.stringify(users));
  } catch (error) {
    console.error("Lỗi khi lấy danh sách người dùng:", error);
    return [];
  }
}

/**
 * Gán hoặc thu hồi quyền truy cập của một user vào một tài khoản Zalo.
 * @param {string} accountId - ID của tài khoản Zalo.
 * @param {string} userId - ID của user.
 * @returns {Promise<object>} Kết quả { success: true } hoặc { error: '...' }.
 */
export async function toggleUserAccess(accountId, userId) {
  try {
    await connectDB();
    const account = await ZaloAccount.findById(accountId);
    if (!account) throw new Error("Không tìm thấy tài khoản Zalo.");

    const userIndex = account.users.findIndex((id) => id.toString() === userId);

    if (userIndex > -1) {
      // Nếu đã có -> Xóa (thu hồi quyền)
      account.users.splice(userIndex, 1);
    } else {
      // Nếu chưa có -> Thêm (gán quyền)
      account.users.push(userId);
    }

    await account.save();
    revalidateAndBroadcast("zalo_accounts");
    return { success: true };
  } catch (error) {
    return { error: error.message };
  }
}

/**
 * Lấy thông tin chi tiết của một tài khoản Zalo, bao gồm cả các user được gán.
 * @param {string} accountId - ID của tài khoản Zalo.
 * @returns {Promise<object|null>} Chi tiết tài khoản hoặc null.
 */
export async function getZaloAccountDetails(accountId) {
  try {
    await connectDB();
    const account = await ZaloAccount.findById(accountId)
      .populate("users", "name email phone role") // Lấy thêm phone và role
      .lean();
    if (!account) return null;
    return JSON.parse(JSON.stringify(account));
  } catch (error) {
    console.error("Lỗi khi lấy chi tiết tài khoản Zalo:", error);
    return null;
  }
}

// ++ ADDED: Hàm mới để cập nhật chi tiết tài khoản
/**
 * Cập nhật các trường thông tin cho một tài khoản Zalo.
 * @param {string} accountId - ID của tài khoản Zalo.
 * @param {object} dataToUpdate - Dữ liệu cần cập nhật.
 * @returns {Promise<object>} Kết quả thực thi.
 */
export async function updateZaloAccountDetails(accountId, dataToUpdate) {
  try {
    await connectDB();
    const updatedAccount = await ZaloAccount.findByIdAndUpdate(
      accountId,
      { $set: dataToUpdate },
      { new: true, runValidators: true },
    );
    if (!updatedAccount)
      throw new Error("Không tìm thấy tài khoản để cập nhật.");
    revalidateAndBroadcast("zalo_accounts");
    return { success: true, data: JSON.parse(JSON.stringify(updatedAccount)) };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// ++ ADDED: Hàm mới để xóa tài khoản Zalo
/**
 * Xóa một tài khoản Zalo khỏi hệ thống.
 * @param {string} accountId - ID của tài khoản Zalo.
 * @returns {Promise<object>} Kết quả thực thi.
 */
export async function deleteZaloAccount(accountId) {
  try {
    await connectDB();
    // Thêm các bước kiểm tra an toàn khác ở đây nếu cần (ví dụ: không cho xóa nếu đang có chiến dịch chạy)
    await ZaloAccount.findByIdAndDelete(accountId);
    revalidateAndBroadcast("zalo_accounts");
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * Tạo mới hoặc cập nhật thông tin tài khoản Zalo bằng token.
 * @param {string} token - Token lấy từ Google Apps Script.
 * @returns {Promise<object>} Kết quả thực thi.
 */
export async function createOrUpdateAccountByToken(token) {
  try {
    if (!token) {
      throw new Error("Token là bắt buộc.");
    }
    await connectDB();

    // 1. Gọi API /api/acc để xử lý token và cập nhật Google Sheet
    const apiResponse = await fetch(
      `${process.env.NEXT_PUBLIC_APP_URL}/api/acc`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      },
    );

    const result = await apiResponse.json();
    if (result.status !== 2) {
      throw new Error(result.mes || "Lỗi khi xử lý token.");
    }

    const accountData = result.data;
    const dataForMongo = {
      uid: accountData.userId,
      name: accountData.name,
      phone: accountData.phone,
      avt: accountData.avatar,
      isTokenActive: true, // Mặc định là active khi tạo/cập nhật
    };

    // 2. Cập nhật hoặc tạo mới (upsert) trong MongoDB
    const updatedAccount = await ZaloAccount.findOneAndUpdate(
      { uid: dataForMongo.uid },
      { $set: dataForMongo },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );

    revalidateAndBroadcast("zalo_accounts");
    return { success: true, data: JSON.parse(JSON.stringify(updatedAccount)) };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * Lấy Zalo token từ Google Sheet dựa trên UID.
 * @param {string} uid - UID của tài khoản Zalo.
 * @returns {Promise<string|null>} - Trả về token hoặc null.
 */
export async function getZaloTokenByUid(uid) {
  if (!uid) return null;
  try {
    const response = await fetch(
      `${process.env.NEXT_PUBLIC_APP_URL}/api/acc?uid=${uid}`,
      {
        method: "GET",
        cache: "no-store", // Luôn lấy dữ liệu mới nhất
      },
    );
    if (!response.ok) return null;

    const result = await response.json();
    return result.success ? result.token : null;
  } catch (error) {
    console.error("Lỗi khi lấy Zalo token:", error);
    return null;
  }
}
