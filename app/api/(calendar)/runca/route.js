import { NextResponse } from "next/server";
import connectToDatabase from "@/config/connectDB";
import User from "@/models/users";
import ZaloAccount from "@/models/zalo";
import Customer from "@/models/customer";
import ScheduledJob from "@/models/schedule";
import authenticate from "@/utils/authenticate";
import { revalidateTag } from "next/cache";
import { logCreateScheduleTask } from "@/app/actions/historyActions";
import { revalidateAndBroadcast } from "@/lib/revalidation";
import mongoose from "mongoose";

/**
 * Tính toán lịch trình và trả về cả các task đã xếp lịch và trạng thái "đặt cọc" của tài khoản.
 * @returns {object} { scheduledTasks, estimatedCompletion, finalCounters }
 */
function schedulePersonsSmart(persons, account, actionsPerHour, actionType) {
  const scheduledTasks = [];
  const baseIntervalMs = 3_600_000 / actionsPerHour;
  const now = new Date();

  // Khởi tạo các biến đếm từ trạng thái hiện tại của account
  let currentTime = new Date(
    Math.max(now.getTime(), account.rateLimitHourStart?.getTime() || 0),
  );
  let rateLimitHourStart = new Date(account.rateLimitHourStart || now);
  let rateLimitDayStart = new Date(account.rateLimitDayStart || now);
  let actionsUsedThisHour = account.actionsUsedThisHour || 0;
  let actionsUsedThisDay = account.actionsUsedThisDay || 0;

  const getNextDayStart = (date) => {
    const nextDay = new Date(date);
    nextDay.setDate(nextDay.getDate() + 1);
    nextDay.setHours(0, 0, 0, 0);
    return nextDay;
  };

  const smartStartDate = new Date(currentTime);

  for (const person of persons) {
    // ** MODIFIED: Logic kiểm tra giới hạn an toàn chỉ áp dụng khi KHÔNG PHẢI sendMessage
    if (actionType !== "sendMessage") {
      let safeTimeFound = false;
      while (!safeTimeFound) {
        const currentHourStartRef = new Date(currentTime);
        currentHourStartRef.setMinutes(0, 0, 0);

        // Logic reset giới hạn giờ
        if (currentTime.getTime() >= rateLimitHourStart.getTime() + 3_600_000) {
          rateLimitHourStart = new Date(currentHourStartRef);
          actionsUsedThisHour = 0;
        }

        // Logic reset giới hạn ngày
        if (
          currentTime.getTime() >= getNextDayStart(rateLimitDayStart).getTime()
        ) {
          rateLimitDayStart = new Date(currentTime);
          rateLimitDayStart.setHours(0, 0, 0, 0);
          actionsUsedThisDay = 0;
          actionsUsedThisHour = 0; // Reset cả bộ đếm giờ khi sang ngày mới
        }

        // Kiểm tra giới hạn
        if (actionsUsedThisHour >= account.rateLimitPerHour) {
          currentTime = new Date(rateLimitHourStart.getTime() + 3_600_000);
          continue; // Lặp lại vòng lặp để logic reset giờ được áp dụng
        }
        if (actionsUsedThisDay >= account.rateLimitPerDay) {
          currentTime = getNextDayStart(rateLimitDayStart);
          continue; // Lặp lại vòng lặp để logic reset ngày được áp dụng
        }

        safeTimeFound = true;
      }
    }

    const jitterMs = (Math.random() - 0.5) * baseIntervalMs * 0.3;
    const finalScheduledTime = new Date(currentTime.getTime() + jitterMs);

    scheduledTasks.push({
      person,
      scheduledFor: finalScheduledTime,
      status: "pending",
    });

    // Cập nhật bộ đếm
    actionsUsedThisHour++;
    actionsUsedThisDay++;
    currentTime.setTime(currentTime.getTime() + baseIntervalMs);
  }

  return {
    scheduledTasks,
    estimatedCompletion: new Date(currentTime.getTime()),
    // ++ ADDED: Trả về "phiếu đặt cọc"
    finalCounters: {
      actionsUsedThisHour,
      rateLimitHourStart,
      actionsUsedThisDay,
      rateLimitDayStart,
    },
  };
}
export async function POST(request) {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    await connectToDatabase();
    const { user, body } = await authenticate(request);
    const { jobName, actionType, config = {}, tasks } = body;

    if (!tasks || tasks.length === 0) {
      throw new Error("Không có khách hàng nào được chọn để lên lịch.");
    }

    const dbUser = await User.findById(user.id).populate("zaloActive").lean();
    if (!dbUser?.zaloActive?._id) {
      throw new Error("Chưa chọn tài khoản Zalo hoạt động.");
    }
    const zaloAccountId = dbUser.zaloActive._id.toString();
    const account = await ZaloAccount.findById(zaloAccountId).session(session);
    if (!account) {
      throw new Error("Không tìm thấy tài khoản Zalo.");
    }
    let finalActionsPerHour = config.actionsPerHour || account.rateLimitPerHour;
    if (actionType === "findUid") {
      finalActionsPerHour = 30;
    }

    // ** MODIFIED: Gọi hàm lập lịch đã nâng cấp
    const { scheduledTasks, estimatedCompletion, finalCounters } =
      schedulePersonsSmart(
        tasks.map((t) => t.person),
        account,
        finalActionsPerHour, // <-- Sử dụng tốc độ cuối cùng
        actionType,
      );

    // ** MODIFIED: "Đặt cọc" giới hạn bằng cách cập nhật ZaloAccount
    await ZaloAccount.updateOne(
      { _id: zaloAccountId },
      { $set: finalCounters },
      { session },
    );

    const [newJob] = await ScheduledJob.create(
      [
        {
          jobName:
            jobName ||
            `Lịch trình ngày ${new Date().toLocaleDateString("vi-VN")}`,
          status: "scheduled",
          actionType,
          zaloAccount: zaloAccountId,
          tasks: scheduledTasks,
          config,
          statistics: { total: tasks.length, completed: 0, failed: 0 },
          estimatedCompletionTime: estimatedCompletion,
          createdBy: user.id,
        },
      ],
      { session },
    );

    const personIds = tasks.map((t) => t.person._id);
    await Customer.updateMany(
      { _id: { $in: personIds } },
      {
        $push: {
          action: {
            job: newJob._id,
            zaloAccount: zaloAccountId,
            actionType: actionType,
            status: "pending",
          },
        },
      },
      { session },
    );

    for (const task of newJob.tasks) {
      await logCreateScheduleTask(user, newJob, task);
    }

    await session.commitTransaction();
    session.endSession();

    revalidateAndBroadcast("customer_data");
    revalidateAndBroadcast("running_jobs");

    return NextResponse.json({ mes: "Đặt lịch thành công!", data: newJob });
  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    console.error("❌ LỖI KHI TẠO LỊCH:", err);
    return NextResponse.json(
      { mes: "Lỗi máy chủ khi tạo lịch.", error: err.message },
      { status: 500 },
    );
  }
}
