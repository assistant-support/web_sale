import { NextResponse } from "next/server";
import connectDB from "@/config/connectDB";
import Customer from "@/models/customer";
import ScheduledJob from "@/models/schedule";
import ArchivedJob from "@/models/archivedJob";
import Variant from "@/models/variant";
import ZaloAccount from "@/models/zalo";
import Lock from "@/models/lock";
import {
  logExecuteScheduleTask,
  logAutoCancelTask,
  logAutoCancelTaskForZaloFailure,
} from "@/app/actions/historyActions";
import mongoose from "mongoose";
import { revalidateAndBroadcast } from "@/lib/revalidation";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export const OPTIONS = () => new NextResponse(null, { headers: cors });

/**
 * Sinh tin nhắn cuối cùng từ template và các biến thể trong DB.
 */
const generateFinalMessage = (messageTemplate, variants) => {
  if (!messageTemplate || !variants || !variants.length) {
    return messageTemplate;
  }
  let finalMessage = messageTemplate;
  const placeholders = messageTemplate.match(/{\w+}/g) || [];

  for (const placeholder of placeholders) {
    const variantName = placeholder.slice(1, -1).toLowerCase();
    const variant = variants.find((v) => v.name === variantName);
    if (variant && variant.words.length > 0) {
      const randomWord =
        variant.words[Math.floor(Math.random() * variant.words.length)];
      finalMessage = finalMessage.replace(placeholder, randomWord);
    }
  }
  return finalMessage;
};

/**
 * Gửi yêu cầu đến script bên ngoài.
 */
const executeExternalScript = async (
  type,
  acc,
  person,
  cfg,
  variants,
  uidForAction,
) => {
  let finalMessage = null;
  if (type === "sendMessage" && cfg.messageTemplate) {
    finalMessage = generateFinalMessage(cfg.messageTemplate, variants);
  }
  if (!acc || !acc.action) {
    throw new Error(
      `Tài khoản Zalo ${acc?.name || ""} chưa được cấu hình script action.`,
    );
  }
  const response = await fetch(acc.action, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify({
      uid: acc.uid,
      phone: person.phone,
      // ** MODIFIED: Sử dụng uidForAction thay vì person.uid
      uidPerson: uidForAction || null,
      actionType: type,
      message: finalMessage || "",
    }),
    cache: "no-store",
  });

  // ** MODIFIED: Ném lỗi ngay cả khi response.ok = true nhưng script báo lỗi
  const textResponse = await response.text();
  try {
    const jsonResponse = JSON.parse(textResponse);
    if (!response.ok || jsonResponse.status === "error") {
      throw new Error(jsonResponse.message || "Lỗi không xác định từ script");
    }
    return { finalMessage, scriptResult: jsonResponse.data };
  } catch (e) {
    // Nếu parse lỗi (như lỗi JSON input), ném lỗi với nội dung text gốc
    if (e instanceof SyntaxError) {
      throw new Error(`Lỗi hệ thống: ${e.toString()}${textResponse}`);
    }
    throw e;
  }
};

const updateDataAfterExecution = async ({
  actionType,
  apiResult,
  customerId,
  zaloAccountId,
}) => {
  const { uidStatus, targetUid, actionMessage, actionStatus } = apiResult;
  if (!uidStatus) return;

  let uidValue;
  if (uidStatus === "found_new" && targetUid) {
    uidValue = targetUid;
  } else if (uidStatus === "provided" && actionStatus === "error") {
    uidValue = "Lỗi: UID cung cấp không hợp lệ";
  } else if (uidStatus === "not_found") {
    uidValue =
      actionMessage && actionMessage.includes("quá nhiều lần")
        ? "Lỗi: Rate limit"
        : "Lỗi: Không tìm thấy";
  } else if (actionType === "findUid" && actionStatus === "error") {
    uidValue = actionMessage || "Lỗi: Script không thực thi được";
  } else {
    return;
  }

  // Logic cập nhật mảng uid mới
  const updateResult = await Customer.updateOne(
    {
      _id: customerId,
      "uid.zaloId": zaloAccountId,
    },
    {
      $set: { "uid.$.uid": uidValue },
    },
  );

  // Nếu không tìm thấy (modifiedCount = 0), có nghĩa là chưa có entry cho zaloId này
  if (updateResult.modifiedCount === 0) {
    await Customer.updateOne(
      { _id: customerId },
      {
        $push: {
          uid: {
            zaloId: zaloAccountId,
            uid: uidValue,
          },
        },
      },
    );
  }
};

/**
 * Lưu trữ, dọn dẹp và xóa một Job đã hoàn thành.
 * @param {object} jobToFinish - Document của job sắp hoàn thành.
 * @param {'completed' | 'failed'} finalStatus - Trạng thái cuối cùng của job.
 */
// ** MODIFIED: Thêm tham số finalStatus
const archiveAndCleanupJob = async (
  completedJob,
  finalStatus = "completed",
  existingSession = null,
) => {
  const session = existingSession || (await mongoose.startSession());
  try {
    if (!existingSession) session.startTransaction();

    const customerIdsInJob = (completedJob.tasks || []).map(
      (task) => new mongoose.Types.ObjectId(task.person._id),
    );

    if (customerIdsInJob.length > 0) {
      await Customer.updateMany(
        { _id: { $in: customerIdsInJob } },
        { $pull: { action: { job: completedJob._id } } },
        { session },
      );
    }

    const archiveData = {
      ...completedJob,
      _id: completedJob._id,
      status: finalStatus,
      completedAt: new Date(),
    };
    delete archiveData.tasks;
    await ArchivedJob.create([archiveData], { session });
    await ScheduledJob.findByIdAndDelete(completedJob._id, { session });

    if (!existingSession) await session.commitTransaction();
  } catch (error) {
    if (!existingSession) await session.abortTransaction();
    console.error(
      `[ARCHIVE FAILED] Lỗi khi lưu trữ Job ${completedJob._id}:`,
      error,
    );
    throw error;
  } finally {
    if (!existingSession) session.endSession();
  }
};

const LOCK_ID = "cron_lock_action_route";
const LOCK_TIMEOUT_MS = 15 * 60 * 1000;

const acquireLock = async () => {
  const now = new Date();
  const result = await Lock.updateOne(
    {
      _id: LOCK_ID,
      $or: [
        { isLocked: false },
        { lockedAt: { $lt: new Date(now.getTime() - LOCK_TIMEOUT_MS) } },
      ],
    },
    { $set: { isLocked: true, lockedAt: now } },
    { upsert: true, new: true },
  );

  // Nếu modifiedCount > 0, có nghĩa là chúng ta đã cập nhật và khóa thành công.
  return result.modifiedCount > 0;
};

const releaseLock = async () => {
  await Lock.updateOne({ _id: LOCK_ID }, { $set: { isLocked: false } });
};

export const GET = async () => {
  try {
    await connectDB();

    if (!(await acquireLock())) {
      console.log("CRON SKIPPED: Một tiến trình khác đang chạy.");
      return NextResponse.json({
        headers: cors,
        message: "Cron đang chạy ở tiến trình khác.",
      });
    }

    try {
      const now = new Date();

      // ** MODIFIED: LOGIC DỌN DẸP NÂNG CẤP **
      // Cơ chế 1: Dọn dẹp các job đã hoàn thành (thay $where bằng $expr)
      const lingeringJobs = await ScheduledJob.find({
        "statistics.total": { $gt: 0 },
        $expr: {
          $gte: [
            { $add: ["$statistics.completed", "$statistics.failed"] },
            "$statistics.total",
          ],
        },
      }).lean();

      for (const job of lingeringJobs) {
        console.log(`🧹 Dọn dẹp job đã hoàn thành: ${job.jobName}`);
        await archiveAndCleanupJob(job);
      }

      // Cơ chế 2: Dọn dẹp các task bị treo (self-healing)
      const tenMinutesAgo = new Date(now.getTime() - 10 * 60 * 1000);
      const timedOutJobs = await ScheduledJob.find({
        "tasks.status": "processing",
        "tasks.processedAt": { $lt: tenMinutesAgo },
      });

      for (const job of timedOutJobs) {
        const tasksToFail = job.tasks.filter(
          (t) =>
            t.status === "processing" &&
            new Date(t.processedAt) < tenMinutesAgo,
        );
        if (tasksToFail.length > 0) {
          const taskIdsToFail = tasksToFail.map((t) => t._id);
          const customerIdsToClean = tasksToFail.map((t) => t.person._id);
          await Promise.all([
            ScheduledJob.updateOne(
              { _id: job._id },
              {
                $set: {
                  "tasks.$[elem].status": "failed",
                  "tasks.$[elem].resultMessage": "Task timed out",
                },
                $inc: { "statistics.failed": tasksToFail.length },
              },
              { arrayFilters: [{ "elem._id": { $in: taskIdsToFail } }] },
            ),
            Customer.updateMany(
              { _id: { $in: customerIdsToClean } },
              { $pull: { action: { job: job._id } } },
            ),
          ]);
        }
      }
      const handleZaloTokenFailure = async (job, task, errorMessage) => {
        // ** MODIFIED: Sửa lỗi tham chiếu biến không xác định
        const zaloAccountId = job.zaloAccount._id;
        const jobId = job._id;
        console.log(
          `🔴 Lỗi Token Zalo cho TK ${zaloAccountId} trong Job ${jobId}. Bắt đầu hủy toàn bộ chiến dịch.`,
        );
        const session = await mongoose.startSession();
        try {
          session.startTransaction();
          // Bước 1: Vô hiệu hóa tài khoản Zalo
          await ZaloAccount.findByIdAndUpdate(
            zaloAccountId,
            { isTokenActive: false },
            { session },
          );
          console.log(`   -> Đã đặt isTokenActive = false cho tài khoản Zalo.`);

          // Bước 2: Tìm job và các task còn lại để hủy
          const jobToCancel = await ScheduledJob.findById(jobId)
            .session(session)
            .lean();
          if (!jobToCancel) {
            console.log(
              `   -> Job ${jobId} không còn tồn tại, có thể đã được xử lý.`,
            );
            await session.abortTransaction();
            return;
          }

          // ** MODIFIED: Hủy tất cả task chưa hoàn thành (pending và processing)
          const tasksToCancel = jobToCancel.tasks.filter(
            (t) => t.status !== "completed" && t.status !== "failed",
          );

          if (tasksToCancel.length > 0) {
            const taskIdsToCancel = tasksToCancel.map((t) => t._id);
            const customerIdsToClean = tasksToCancel.map((t) => t.person._id);

            for (const taskToCancel of tasksToCancel) {
              await logAutoCancelTaskForZaloFailure(
                jobToCancel,
                taskToCancel,
                errorMessage,
              );
            }

            // Bước 4: Cập nhật trạng thái và thống kê cho các task còn lại
            await ScheduledJob.updateOne(
              { _id: jobId },
              {
                $set: {
                  "tasks.$[elem].status": "failed",
                  "tasks.$[elem].resultMessage": "Hủy do lỗi tài khoản Zalo",
                },
                $inc: { "statistics.failed": tasksToCancel.length },
              },
              {
                arrayFilters: [{ "elem._id": { $in: taskIdsToCancel } }],
                session,
              },
            );

            await Customer.updateMany(
              { _id: { $in: customerIdsToClean } },
              { $pull: { action: { job: jobId } } },
              { session },
            );
          } else {
            console.log("   -> Không có task 'pending' nào cần hủy.");
          }

          // Bước 5: Kết thúc và lưu trữ chiến dịch với trạng thái 'failed'
          const finalJobState = await ScheduledJob.findById(jobId)
            .session(session)
            .lean();
          // ** MODIFIED: Truyền session hiện có vào hàm archive để tránh lỗi WriteConflict
          await archiveAndCleanupJob(finalJobState, "failed", session);

          await session.commitTransaction();
          revalidateAndBroadcast("zalo_accounts");
        } catch (error) {
          await session.abortTransaction();
          console.error(
            `Lỗi khi xử lý Zalo Token Failure cho job ${jobId}:`,
            error,
          );
        } finally {
          session.endSession();
        }
      };

      let processedCount = 0;
      const allVariants = await Variant.find().lean();

      // BƯỚC 1: LẤY TẤT CẢ TASK ĐẾN HẠN TỪ MỌI CHIẾN DỊCH
      const dueTasks = await ScheduledJob.aggregate([
        // Tìm các chiến dịch có task cần chạy
        {
          $match: {
            "tasks.status": "pending",
            "tasks.scheduledFor": { $lte: now },
          },
        },
        // "Bung" mảng tasks ra thành các document riêng lẻ
        { $unwind: "$tasks" },
        // Lọc lại một lần nữa để chỉ giữ lại các task thỏa mãn điều kiện
        {
          $match: {
            "tasks.status": "pending",
            "tasks.scheduledFor": { $lte: now },
          },
        },
        // Sắp xếp TẤT CẢ CÁC TASK theo thời gian đến hạn
        { $sort: { "tasks.scheduledFor": 1 } },
        // Giới hạn số lượng task xử lý trong một lần chạy cron để tránh quá tải
        // Gom lại các thông tin cần thiết
        {
          $project: {
            jobId: "$_id",
            jobName: "$jobName",
            actionType: "$actionType",
            zaloAccount: "$zaloAccount",
            config: "$config",
            createdBy: "$createdBy",
            task: "$tasks",
          },
        },
      ]);

      if (dueTasks.length === 0) {
        // ** MODIFIED: THAY THẾ $where BẰNG $expr ĐỂ SỬA LỖI **
        const lingeringJobsOnEmpty = await ScheduledJob.find({
          "statistics.total": { $gt: 0 },
          $expr: {
            $gte: [
              { $add: ["$statistics.completed", "$statistics.failed"] },
              "$statistics.total",
            ],
          },
        }).lean(); // ++ ADDED: .lean() để tăng hiệu suất

        for (const job of lingeringJobsOnEmpty) {
          console.log(`🧹 Dọn dẹp job bị treo (hết task): ${job.jobName}`);
          await archiveAndCleanupJob(job);
        }
        return NextResponse.json({
          headers: cors,
          message: "Không có task nào đến hạn.",
        });
      }

      // BƯỚC 2: XỬ LÝ TUẦN TỰ TỪNG TASK ĐÃ LỌC
      for (const item of dueTasks) {
        const { jobId, task } = item;

        try {
          const lockResult = await ScheduledJob.findOneAndUpdate(
            { _id: jobId, "tasks._id": task._id, "tasks.status": "pending" },
            {
              $set: {
                "tasks.$.status": "processing",
                "tasks.$.processedAt": new Date(),
              },
            },
            { projection: { _id: 1 } },
          );

          if (!lockResult) continue;

          // BƯỚC 2: LẤY DỮ LIỆU ĐẦY ĐỦ SAU KHI KHÓA THÀNH CÔNG
          const jobUpdate = await ScheduledJob.findById(jobId).populate(
            "zaloAccount",
          );
          if (!jobUpdate) continue;

          let executionResult;
          const uidArray = Array.isArray(task.person.uid)
            ? task.person.uid
            : [];
          const relevantUidEntry = uidArray.find(
            (entry) =>
              entry.zaloId.toString() === jobUpdate.zaloAccount._id.toString(),
          );
          const uidForAction = relevantUidEntry ? relevantUidEntry.uid : null;

          try {
            const scriptResponse = await executeExternalScript(
              jobUpdate.actionType,
              jobUpdate.zaloAccount,
              task.person,
              jobUpdate.config,
              allVariants,
              uidForAction,
            );
            executionResult = {
              ...scriptResponse.scriptResult,
              finalMessage: scriptResponse.finalMessage,
            };
          } catch (e) {
            executionResult = {
              actionStatus: "error",
              actionMessage: e.message,
            };
            // ** MODIFIED: Bắt đầu logic xử lý lỗi token
            if (
              e.message.includes("SyntaxError: Unexpected end of JSON input")
            ) {
              await ScheduledJob.updateOne(
                { _id: jobId, "tasks._id": task._id },
                {
                  $set: {
                    "tasks.$.status": "failed",
                    "tasks.$.resultMessage": e.message,
                  },
                  $inc: { "statistics.failed": 1 },
                },
              );
              await handleZaloTokenFailure(jobUpdate, task, e.message);
              continue;
            }
          }

          const statusName =
            executionResult.actionStatus === "success" ? "SUCCESS" : "FAILED";
          const resultMessage = executionResult.actionMessage || statusName;

          await ScheduledJob.updateOne(
            { _id: jobId },
            { $set: { lastExecutionResult: resultMessage } },
          );

          // Thực hiện ghi log và cập nhật UID song song
          await Promise.all([
            logExecuteScheduleTask({
              jobInfo: {
                ...item,
                zaloAccountId: item.zaloAccount,
                jobId: item.jobId,
              },
              task,
              customerId: task.person._id,
              statusName,
              executionResult,
              finalMessage: executionResult.finalMessage,
            }),
            updateDataAfterExecution({
              actionType: jobUpdate.actionType,
              apiResult: executionResult,
              customerId: task.person._id,
              zaloAccountId: jobUpdate.zaloAccount._id,
            }),
            Customer.updateOne(
              { _id: task.person._id },
              { $pull: { action: { job: jobId } } },
            ),
          ]);

          // ** MODIFIED: Tích hợp lại logic xử lý rate limit và dùng biến `jobUpdate`
          if (statusName === "FAILED" && jobUpdate.actionType === "findUid") {
            const errorMessage = executionResult.actionMessage || "";
            let cancelScope = null;
            if (errorMessage.includes("trong 1 giờ")) cancelScope = "hour";
            else if (errorMessage.includes("trong 1 ngày")) cancelScope = "day";

            if (cancelScope) {
              const originalJobState = await ScheduledJob.findById(
                jobUpdate._id,
              ).lean();
              if (originalJobState) {
                const endTime = new Date(now);
                if (cancelScope === "hour") {
                  endTime.setMinutes(59, 59, 999);
                } else {
                  endTime.setHours(23, 59, 59, 999);
                }

                const tasksToCancel = (originalJobState.tasks || []).filter(
                  (t) =>
                    t.status === "pending" &&
                    new Date(t.scheduledFor) <= endTime,
                );

                if (tasksToCancel.length > 0) {
                  console.log(
                    `⚠️  Phát hiện lỗi giới hạn ${cancelScope}, đang hủy ${tasksToCancel.length} task...`,
                  );
                  const taskIdsToCancel = tasksToCancel.map((t) => t._id);
                  const customerIdsToClean = tasksToCancel.map(
                    (t) => t.person._id,
                  );
                  for (const taskToCancel of tasksToCancel) {
                    await logAutoCancelTask(
                      originalJobState,
                      taskToCancel,
                      cancelScope,
                    );
                  }

                  await ScheduledJob.updateOne(
                    { _id: jobUpdate._id },
                    {
                      $set: {
                        "tasks.$[elem].status": "failed",
                        "tasks.$[elem].resultMessage": `Tự động hủy do đạt giới hạn ${cancelScope}`,
                      },
                      $inc: { "statistics.failed": tasksToCancel.length },
                    },
                    {
                      arrayFilters: [{ "elem._id": { $in: taskIdsToCancel } }],
                    },
                  );

                  await Customer.updateMany(
                    { _id: { $in: customerIdsToClean } },
                    { $pull: { action: { job: jobUpdate._id } } },
                  );
                }
              }
            }
          }

          // BƯỚC 2.4: CẬP NHẬT KẾT QUẢ CUỐI CÙNG VÀO ĐÚNG TASK ĐÓ
          const finalUpdateResult = await ScheduledJob.findOneAndUpdate(
            { _id: jobId, "tasks._id": task._id },
            {
              $set: {
                "tasks.$.status":
                  statusName === "SUCCESS" ? "completed" : "failed",
                "tasks.$.resultMessage": resultMessage,
              },
              $inc: {
                [statusName === "SUCCESS"
                  ? "statistics.completed"
                  : "statistics.failed"]: 1,
              },
            },
            { new: true, lean: true },
          );
          processedCount++;

          // BƯỚC 2.5: KIỂM TRA HOÀN THÀNH CHIẾN DỊCH
          if (finalUpdateResult) {
            const stats = finalUpdateResult.statistics;
            if (stats && stats.completed + stats.failed >= stats.total) {
              await archiveAndCleanupJob(finalUpdateResult);
            }
          }
        } catch (cronError) {
          console.error(
            `❌ Lỗi hệ thống khi xử lý task ${task._id} của job ${jobId}:`,
            cronError,
          );
          // ** MODIFIED: GHI LẠI LỖI HỆ THỐNG VÀO JOB CHA **
          await ScheduledJob.updateOne(
            { _id: jobId },
            {
              $set: {
                lastExecutionResult: `Lỗi hệ thống: ${cronError.message}`,
              },
            },
          );
        }
      }

      if (processedCount > 0) {
        revalidateAndBroadcast("customer_data");
        revalidateAndBroadcast("running_jobs");
        revalidateAndBroadcast("archived_jobs");
      }

      return NextResponse.json({
        headers: cors,
        message: `Cron job đã chạy. Xử lý ${processedCount} tác vụ.`,
      });
    } catch (err) {
      console.error("CRON JOB FAILED:", err);

      // Cố gắng cập nhật tất cả các job đang chạy với thông báo lỗi
      try {
        await connectDB();
        await ScheduledJob.updateMany(
          { status: { $in: ["scheduled", "processing"] } },
          { $set: { lastExecutionResult: `CRON FAILED: ${err.message}` } },
        );
        revalidateAndBroadcast("running_jobs");
      } catch (updateError) {
        console.error(
          "Failed to update running jobs with critical error:",
          updateError,
        );
      }

      return NextResponse.json(
        { message: "Lỗi nghiêm trọng trong CRON job.", error: err.message },
        { status: 500 },
      );
    }
    // --- Kết thúc logic xử lý CRON JOB ---
  } catch (initialError) {
    // Bắt các lỗi xảy ra ở tầng cao nhất (như lỗi kết nối DB)
    console.error("CRITICAL CRON ERROR:", initialError);
    return NextResponse.json(
      {
        message: "Lỗi nghiêm trọng không thể bắt đầu CRON job.",
        error: initialError.message,
      },
      { status: 500 },
    );
  } finally {
    // ** MODIFIED: Đảm bảo giải phóng khóa dù có lỗi hay không
    await releaseLock();
    console.log("CRON FINISHED: Đã giải phóng khóa.");
  }
};
