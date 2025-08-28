// File: app/actions/campaignActions.js
"use server";

import connectDB from "@/config/connectDB";
import Label from "@/models/label";
import { revalidatePath } from "next/cache";
import ScheduledJob from "@/models/schedule";
import { getCurrentUser } from "@/lib/session";
import { logDeleteScheduleTask } from "./historyActions";
import ArchivedJob from "@/models/archivedJob";
import Customer from "@/models/customer";
import { revalidateAndBroadcast } from "@/lib/revalidation";

/**
 * Lấy tất cả các chiến dịch (labels) từ database.
 * @returns {Promise<Array>} Mảng các chiến dịch.
 */
export async function getLabel({ page = 1, limit = 10 } = {}) {
  try {
    await connectDB();
    const skip = (page - 1) * limit;
    const [labels, total] = await Promise.all([
      Label.find({}).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      Label.countDocuments({}),
    ]);
    return {
      success: true,
      data: JSON.parse(JSON.stringify(labels)),
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  } catch (error) {
    return { success: false, error: error.message, data: [], pagination: {} };
  }
}

/**
 * Tạo hoặc cập nhật một Nhãn (Label).
 * Sửa đổi: Giờ đây sẽ trả về document đã được tạo/cập nhật.
 */
export async function createOrUpdateLabel(data) {
  try {
    await connectDB();
    const { id, title, desc, content } = data; // Thêm `desc`

    if (!title) {
      throw new Error("Tên nhãn là bắt buộc.");
    }

    let savedLabel;
    if (id) {
      // Cập nhật và trả về document mới
      savedLabel = await Label.findByIdAndUpdate(
        id,
        { title, desc, content },
        { new: true }, // {new: true} để trả về bản ghi sau khi cập nhật
      ).lean();
    } else {
      // Tạo mới và trả về document mới
      savedLabel = await Label.create({ title, desc, content });
      savedLabel = savedLabel.toObject(); // Chuyển sang object thuần
    }

    revalidateAndBroadcast("labels");
    // Trả về dữ liệu đã được lưu dưới dạng object JSON
    return { success: true, data: JSON.parse(JSON.stringify(savedLabel)) };
  } catch (error) {
    return { error: error.message };
  }
}

/**
 * Xóa một chiến dịch dựa trên ID.
 * @param {string} id - ID của chiến dịch cần xóa.
 * @returns {Promise<object>} Kết quả { success: true } hoặc { error: '...' }.
 */
export async function deleteLabel(id) {
  try {
    await connectDB();
    await Label.findByIdAndDelete(id);
    revalidateAndBroadcast("labels");
    return { success: true };
  } catch (error) {
    return { error: error.message };
  }
}

/**
 * Lấy tất cả các chiến dịch (jobs) đang có trạng thái 'processing' hoặc 'scheduled'.
 * Hàm này dành cho trang Admin.
 * @returns {Promise<Array>} - Mảng các object job đang chạy.
 */
export async function getRunningJobs(page = 1, limit = 10) {
  try {
    await connectDB();
    const skip = (page - 1) * limit;
    const query = { status: { $in: ["scheduled", "processing"] } };
    const [jobsFromDB, total] = await Promise.all([
      ScheduledJob.find(query)
        .populate([
          {
            path: "createdBy",
            select: "name email phone role",
          },
          {
            path: "zaloAccount",
            select: "name phone avt", // Lấy thêm phone và avatar
          },
        ])
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      ScheduledJob.countDocuments(query),
    ]);

    // "Làm phẳng" dữ liệu một cách thủ công để đảm bảo an toàn tuyệt đối
    const safeJobs = jobsFromDB.map((job) => ({
      ...job,
      _id: job._id.toString(),
      createdBy: job.createdBy
        ? {
            ...job.createdBy,
            _id: job.createdBy._id.toString(),
          }
        : null,
      zaloAccount: job.zaloAccount
        ? {
            ...job.zaloAccount,
            _id: job.zaloAccount._id.toString(),
          }
        : null,
      tasks: job.tasks.map((task) => ({
        ...task,
        _id: task._id.toString(),
        person: {
          ...task.person,
          _id: task.person._id.toString(),
        },
      })),
    }));

    return {
      success: true,
      data: safeJobs,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  } catch (error) {
    console.error("Lỗi khi lấy danh sách chiến dịch đang chạy:", error);
    return [];
  }
}

/**
 * Dừng và xóa hoàn toàn một lịch trình đang chạy.
 * @param {string} scheduleId - ID của lịch trình cần dừng.
 * @returns {Promise<object>} - Kết quả thực thi.
 */
export async function stopSchedule(scheduleId) {
  try {
    const user = await getCurrentUser();
    if (!user) throw new Error("Unauthorized");

    await connectDB();

    const jobToStop = await ScheduledJob.findById(scheduleId).lean();
    if (!jobToStop) {
      return { error: "Không tìm thấy lịch trình để dừng." };
    }

    const customerIdsInJob = jobToStop.tasks.map((task) => task.person._id);

    // -------------------- START: BỔ SUNG LOGIC DỌN DẸP --------------------
    // Chú thích: Xóa các action ref trỏ đến lịch trình này khỏi tất cả các khách hàng liên quan.
    if (customerIdsInJob.length > 0) {
      await Customer.updateMany(
        { _id: { $in: customerIdsInJob } },
        { $pull: { action: { job: jobToStop._id } } },
      );
    }
    // --------------------  END: BỔ SUNG LOGIC DỌN DẸP  --------------------

    // Xóa lịch trình khỏi DB
    await ScheduledJob.findByIdAndDelete(scheduleId);

    // Lặp qua danh sách khách hàng đã bị ảnh hưởng để ghi log
    for (const task of jobToStop.tasks) {
      await logDeleteScheduleTask(user, jobToStop, task);
    }

    revalidateAndBroadcast("running_jobs");
    revalidateAndBroadcast("customer_data");
    return {
      success: true,
      message: "Lịch trình đã được dừng và dọn dẹp thành công.",
    };
  } catch (error) {
    return { error: error.message };
  }
}

/**
 * Xóa một người nhận (task) ra khỏi một lịch trình đang chạy.
 * @param {string} scheduleId - ID của lịch trình.
 * @param {string} taskId - ID của task cần xóa.
 * @returns {Promise<object>} - Kết quả thực thi.
 */
export async function removeTaskFromSchedule(scheduleId, taskId) {
  try {
    const user = await getCurrentUser();
    if (!user) throw new Error("Unauthorized");

    await connectDB();

    const schedule = await ScheduledJob.findById(scheduleId);
    if (!schedule) return { error: "Không tìm thấy lịch trình." };

    const taskToRemove = schedule.tasks.find(
      (t) => t._id.toString() === taskId,
    );
    if (!taskToRemove)
      return { error: "Không tìm thấy người nhận trong lịch trình." };

    // Ghi log cho hành động xóa
    await logDeleteScheduleTask(user, schedule, taskToRemove);

    // ** MODIFIED: Thực hiện 2 hành động cập nhật song song
    const [updatedJobResult] = await Promise.all([
      ScheduledJob.findByIdAndUpdate(
        scheduleId,
        {
          $pull: { tasks: { _id: taskId } },
          $inc: { "statistics.total": -1 },
        },
        { new: true },
      ),
      // ++ ADDED: Dọn dẹp tham chiếu trong Customer ngay lập tức
      Customer.updateOne(
        { _id: taskToRemove.person._id },
        { $pull: { action: { job: scheduleId } } },
      ),
    ]);

    revalidateAndBroadcast("running_jobs");
    revalidateAndBroadcast("customer_data");

    return {
      success: true,
      updatedJob: JSON.parse(JSON.stringify(updatedJobResult)),
    };
  } catch (error) {
    return { error: error.message };
  }
}

export async function getArchivedJobs({ page = 1, limit = 10 } = {}) {
  try {
    await connectDB();
    const skip = (page - 1) * limit;
    const [jobsFromDB, total] = await Promise.all([
      ArchivedJob.find({})
        .populate([
          {
            path: "createdBy",
            select: "name email phone role", // Lấy thêm email
          },
          {
            path: "zaloAccount",
            select: "name phone avt", // Lấy thêm phone và avatar
          },
        ])
        .sort({ completedAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      ArchivedJob.countDocuments({}),
    ]);

    const safeJobs = jobsFromDB.map((job) => ({
      ...job,
      _id: job._id.toString(),
      createdBy: job.createdBy
        ? {
            ...job.createdBy,
            _id: job.createdBy._id.toString(),
          }
        : null,
      zaloAccount: job.zaloAccount
        ? {
            ...job.zaloAccount,
            _id: job.zaloAccount._id.toString(),
          }
        : null,
    }));

    return {
      success: true,
      data: safeJobs,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  } catch (error) {
    console.error("Lỗi khi lấy lịch sử chiến dịch:", error);
    return [];
  }
}
