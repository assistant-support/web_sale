// web_tslhu/app/actions/scheduleActions.js
// -------------------- START: THAY THẾ TOÀN BỘ FILE --------------------
// Chú thích: Cập nhật logic reset lúc 0h để đồng bộ với API tạo lịch trình.
"use server";

import connectDB from "@/config/connectDB";
import ZaloAccount from "@/models/zalo";
import { getCurrentUser } from "@/lib/session";

// --- BỘ NÃO LẬP LỊCH THÔNG MINH ---
function schedulePersonsSmart(persons, account, actionsPerHour) {
  const scheduledTasks = [];
  const baseIntervalMs = 3_600_000 / actionsPerHour;
  const now = new Date();

  let currentTime = new Date(
    Math.max(now.getTime(), account.rateLimitHourStart?.getTime() || 0),
  );
  let currentHourUsage = account.actionsUsedThisHour || 0;
  let currentDayUsage = account.actionsUsedThisDay || 0;

  //<-----------------THAY ĐỔI: Reset giới hạn ngày vào 0h đêm----------------->
  const getNextDayStart = (date) => {
    const nextDay = new Date(date);
    nextDay.setDate(nextDay.getDate() + 1);
    nextDay.setHours(0, 0, 0, 0); // Đặt lại vào 00:00:00
    return nextDay;
  };

  const smartStartDate = new Date(currentTime);

  for (const person of persons) {
    let safeTimeFound = false;
    while (!safeTimeFound) {
      const currentHourStart = new Date(currentTime);
      currentHourStart.setMinutes(0, 0, 0);

      const currentDayStart = new Date(account.rateLimitDayStart || 0);
      currentDayStart.setHours(0, 0, 0, 0);
      const nextDayStart = getNextDayStart(currentDayStart);

      if (currentHourUsage >= account.rateLimitPerHour) {
        currentTime = new Date(currentHourStart.getTime() + 3_600_000);
        currentHourUsage = 0;
        continue;
      }

      if (
        currentDayUsage >= account.rateLimitPerDay ||
        currentTime >= nextDayStart
      ) {
        currentTime = getNextDayStart(currentDayStart); // Sử dụng hàm mới
        currentDayUsage = 0;
        currentHourUsage = 0;
        account.rateLimitDayStart = new Date(currentTime);
        continue;
      }

      safeTimeFound = true;
    }

    const jitterMs = (Math.random() - 0.5) * baseIntervalMs * 0.3;
    const finalScheduledTime = new Date(currentTime.getTime() + jitterMs);

    scheduledTasks.push({
      person,
      scheduledFor: finalScheduledTime,
      status: "pending",
    });

    currentHourUsage++;
    currentDayUsage++;
    currentTime.setTime(currentTime.getTime() + baseIntervalMs);
  }

  return {
    scheduledTasks,
    estimatedCompletion: new Date(currentTime.getTime()),
    smartStartDate,
  };
}

export async function getScheduleEstimation(actionType, taskCount) {
  try {
    await connectDB();
    const user = await getCurrentUser();
    if (!user?.zaloActive) {
      throw new Error("Vui lòng chọn tài khoản Zalo đang hoạt động.");
    }

    const account = await ZaloAccount.findById(user.zaloActive);
    if (!account) {
      throw new Error("Không tìm thấy tài khoản Zalo.");
    }

    const mockPersons = Array.from({ length: taskCount }, (_, i) => ({
      id: i,
    }));

    const { estimatedCompletion, smartStartDate } = schedulePersonsSmart(
      mockPersons,
      account,
      account.rateLimitPerHour,
    );

    return {
      success: true,
      data: {
        estimatedStart: smartStartDate.toLocaleString("vi-VN"),
        estimatedCompletion: estimatedCompletion.toLocaleString("vi-VN"),
      },
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
}
// --------------------  END: THAY THẾ TOÀN BỘ FILE  --------------------
