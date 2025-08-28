// ++ ADDED: Toàn bộ file này là mới
"use server";

import connectDB from "@/config/connectDB";
import Status from "@/models/status";
import Customer from "@/models/customer";
import { revalidateTag } from "next/cache";

/**
 * Lấy tất cả các trạng thái và sắp xếp theo thứ tự QTxx.
 */
export async function getStatuses({ page = 1, limit = 10 } = {}) {
  try {
    await connectDB();
    const skip = (page - 1) * limit;
    // Lấy tất cả và sắp xếp bằng JS vì logic QTxx phức tạp
    const allStatuses = await Status.find({}).lean();

    const sortedStatuses = allStatuses.sort((a, b) => {
      const matchA = a.name.match(/^QT(\d+)\|/);
      const matchB = b.name.match(/^QT(\d+)\|/);
      const orderA = matchA ? parseInt(matchA[1], 10) : Infinity;
      const orderB = matchB ? parseInt(matchB[1], 10) : Infinity;
      return orderA - orderB;
    });

    const total = sortedStatuses.length;
    const paginatedData = sortedStatuses.slice(skip, skip + limit);

    return {
      success: true,
      data: JSON.parse(JSON.stringify(paginatedData)),
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  } catch (error) {
    return { success: false, error: "Không thể lấy danh sách trạng thái." };
  }
}

/**
 * Tạo hoặc cập nhật một trạng thái, có kiểm tra định dạng tên.
 */
export async function createOrUpdateStatus(data) {
  try {
    await connectDB();
    const { id, name, description } = data;

    // --- LOGIC VALIDATION ---
    if (!name) throw new Error("Tên trạng thái là bắt buộc.");
    const formatRegex = /^QT(\d+)\|\s*(.+)/;
    if (!formatRegex.test(name)) {
      throw new Error(
        "Định dạng tên không hợp lệ. Phải là: QTxx| <Tên trạng thái>",
      );
    }

    const statusData = { name, description };
    let savedStatus;

    if (id) {
      // Cập nhật
      savedStatus = await Status.findByIdAndUpdate(id, statusData, {
        new: true,
      }).lean();
      if (!savedStatus)
        throw new Error("Không tìm thấy trạng thái để cập nhật.");
    } else {
      // Tạo mới
      savedStatus = await Status.create(statusData);
    }

    revalidateTag("statuses"); // Dùng tag để revalidate
    revalidateTag("customer_data"); // Cần revalidate cả data khách hàng

    return { success: true, data: JSON.parse(JSON.stringify(savedStatus)) };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * Xóa một trạng thái và dọn dẹp các khách hàng liên quan.
 */
export async function deleteStatus(statusId) {
  try {
    if (!statusId) throw new Error("Cần có ID để xóa.");
    await connectDB();

    // Dọn dẹp: unset status khỏi tất cả các khách hàng đang dùng nó
    await Customer.updateMany({ status: statusId }, { $unset: { status: "" } });

    // Xóa trạng thái
    const deleted = await Status.findByIdAndDelete(statusId);
    if (!deleted) throw new Error("Không tìm thấy trạng thái để xóa.");

    revalidateTag("statuses");
    revalidateTag("customer_data");

    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
}
