// data/customer.js
"use server";

import connectDB from "@/config/connectDB";
import Client from "@/models/customer";
import Label from "@/models/label";
import Status from "@/models/status";
import User from "@/models/users";
import { revalidateTag } from "next/cache";
import ActionHistory from "@/models/history";
import { Types } from "mongoose";

export async function Data_Client(searchParams = {}) {
  try {
    await connectDB();

    const page = parseInt(searchParams.page) || 1;
    const limit = parseInt(searchParams.limit) || 50;
    const skip = (page - 1) * limit;

    const query = {};

    // ++ ADDED: LOGIC LỌC MỚI THEO UID FINDER
    if (
      searchParams.uidFinder &&
      Types.ObjectId.isValid(searchParams.uidFinder)
    ) {
      // 1. Tìm các hành động tìm UID thành công gần nhất cho mỗi khách hàng
      const latestFinds = await ActionHistory.aggregate([
        {
          $match: {
            action: "DO_SCHEDULE_FIND_UID",
            "status.status": "SUCCESS",
          },
        },
        { $sort: { time: -1 } },
        {
          $group: {
            _id: "$customer", // Nhóm theo ID khách hàng
            lastFinder: { $first: "$zalo" }, // Lấy Zalo account của hành động gần nhất
          },
        },
        {
          $match: {
            // 2. Lọc ra những nhóm mà Zalo account gần nhất trùng với bộ lọc
            lastFinder: new Types.ObjectId(searchParams.uidFinder),
          },
        },
        {
          $project: {
            _id: 1, // Chỉ lấy ra ID khách hàng
          },
        },
      ]);

      // 3. Lấy ra mảng các ID khách hàng hợp lệ
      const customerIds = latestFinds.map((item) => item._id);

      // Nếu không tìm thấy khách hàng nào, trả về mảng rỗng để không hiển thị gì
      if (customerIds.length === 0) {
        return {
          data: [],
          pagination: { page, limit, total: 0, totalPages: 1 },
        };
      }

      // 4. Thêm điều kiện này vào query chính
      query._id = { $in: customerIds };
    }
    // -- KẾT THÚC LOGIC LỌC MỚI --

    if (searchParams.status) {
      if (searchParams.status === "none") {
        query.status = { $in: [null] };
      } else {
        query.status = searchParams.status;
      }
    }

    if (searchParams.query) {
      const searchRegex = new RegExp(searchParams.query, "i");
      query.$or = [{ name: searchRegex }, { phone: searchRegex }];
    }

    if (searchParams.uidStatus) {
      switch (searchParams.uidStatus) {
        case "found":
          query.uid = { $regex: /^\d+$/ };
          break;
        case "pending":
          query.uid = { $in: [null, ""] };
          break;
        case "error":
          query.uid = { $type: "string", $ne: "", $not: /^\d+$/ };
          break;
      }
    }

    const clientsQuery = Client.find(query)
      .populate({ path: "status", model: Status, select: "name" })
      .populate({ path: "users", model: User, select: "name" })
      .populate({
        path: "comments.user",
        model: User,
        select: "name",
      })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    // Thực thi cả hai truy vấn song song để tối ưu
    const [clientsFromDB, totalClients] = await Promise.all([
      clientsQuery,
      Client.countDocuments(query), // Đảm bảo count cũng dùng chung query
    ]);

    clientsFromDB.forEach((client) => {
      if (client.comments && Array.isArray(client.comments)) {
        client.comments.sort((a, b) => new Date(b.time) - new Date(a.time));
      }
    });

    return {
      data: JSON.parse(JSON.stringify(clientsFromDB)),
      pagination: {
        page,
        limit,
        total: totalClients,
        totalPages: Math.ceil(totalClients / limit),
      },
    };
  } catch (error) {
    console.error("Lỗi trong Data_Client:", error);
    return {
      data: [],
      pagination: { page: 1, limit: 10, total: 0, totalPages: 1 },
    };
  }
}

/**
 * Lấy tất cả các nhãn (labels) từ DB.
 */
export async function Data_Label() {
  try {
    await connectDB();
    const labels = await Label.find({}).lean();
    return { data: JSON.parse(JSON.stringify(labels)) };
  } catch (error) {
    console.error("Lỗi trong Data_Label:", error);
    return { data: [] };
  }
}

/**
 * Lấy tất cả các trạng thái (statuses) từ DB.
 */
export async function Data_Status() {
  try {
    await connectDB();
    // ** MODIFIED: Bỏ logic sort cũ, chỉ lấy dữ liệu thô
    const statuses = await Status.find({}).lean();

    // ** MODIFIED: Thêm logic sắp xếp bằng JavaScript dựa trên tiền tố QTxx
    const sortedStatuses = statuses.sort((a, b) => {
      const matchA = a.name.match(/^QT(\d+)\|/);
      const matchB = b.name.match(/^QT(\d+)\|/);
      // Gán một số lớn cho những trạng thái không có định dạng để chúng xuống cuối
      const orderA = matchA ? parseInt(matchA[1], 10) : Infinity;
      const orderB = matchB ? parseInt(matchB[1], 10) : Infinity;

      // Sắp xếp theo số thứ tự trước
      if (orderA !== orderB) {
        return orderA - orderB;
      }
      // Nếu số thứ tự bằng nhau, sắp xếp theo tên alphabet
      return a.name.localeCompare(b.name);
    });

    return { data: JSON.parse(JSON.stringify(sortedStatuses)) };
  } catch (error) {
    console.error("Lỗi trong Data_Status:", error);
    return { data: [] };
  }
}
/**
 * Làm mới cache cho dữ liệu khách hàng.
 */
export async function Re_data_client() {
  revalidateTag("data_client");
}

export async function Re_Label() {
  revalidateTag("data_label");
}
