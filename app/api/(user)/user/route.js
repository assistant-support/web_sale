import { NextResponse } from "next/server";
import connectDB from "@/config/connectDB";
import User from "@/models/users";
import authenticate from "@/utils/authenticate";
import "@/models/zalo";
import ScheduledJob from "@/models/schedule";

export async function POST(req) {
  try {
    const { user } = await authenticate(req);
    await connectDB();

    const data = await User.findById(user.id, { __v: 0, uid: 0 })
      .populate({
        path: "zalo",
        select:
          "uid name phone avt actionsUsedThisHour rateLimitPerHour task isLocked action",
      })
      .lean();

    if (!data)
      return NextResponse.json(
        { mes: "Không tìm thấy người dùng." },
        { status: 404 },
      );

    if (!data.zalo)
      return NextResponse.json(
        { mes: "Người dùng chưa gắn tài khoản Zalo." },
        { status: 400 },
      );

    const ids = data.zalo.task?.map((t) => t.id) || [];
    const jobs = ids.length
      ? await ScheduledJob.find({ _id: { $in: ids } }).lean()
      : [];
    const map = Object.fromEntries(jobs.map((j) => [j._id.toString(), j]));
    data.zalo.runningJobs = (data.zalo.task || []).map((t) => ({
      ...t,
      job: map[t.id.toString()] || null,
    }));

    return NextResponse.json({ data }, { status: 200 });
  } catch (e) {
    return NextResponse.json(
      { mes: "Lỗi khi lấy dữ liệu người dùng.", error: e.message },
      { status: 500 },
    );
  }
}
