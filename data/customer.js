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
    // console.log("[DEBUG] Tham số lọc nhận được trên server:", searchParams);
    await connectDB();

    const page = parseInt(searchParams.page) || 1;
    const limit = parseInt(searchParams.limit) || 50;
    const skip = (page - 1) * limit;
    const {
      query: searchQuery,
      filterStatus,
      uidStatus,
      zaloActive,
    } = searchParams;

    const query = {};

    // Sử dụng biến mới 'filterStatus'
    if (filterStatus) {
      if (filterStatus === "none") {
        query.status = { $in: [null, undefined] };
      } else if (Types.ObjectId.isValid(filterStatus)) {
        query.status = filterStatus;
      }
    }

    // Thêm điều kiện tìm kiếm (nếu có)
    if (searchQuery) {
      const searchRegex = new RegExp(searchQuery, "i");
      query.$or = [{ name: searchRegex }, { phone: searchRegex }];
    }

    // Thêm điều kiện lọc UID (nếu có)
    if (uidStatus) {
      if (zaloActive && Types.ObjectId.isValid(zaloActive)) {
        const zaloObjectId = new Types.ObjectId(zaloActive);
        switch (uidStatus) {
          case "found":
            query.uid = {
              $elemMatch: { zaloId: zaloObjectId, uid: { $regex: /^\d+$/ } },
            };
            break;
          case "error":
            query.uid = {
              $elemMatch: { zaloId: zaloObjectId, uid: { $not: /^\d+$/ } },
            };
            break;
          case "pending":
            query["uid.zaloId"] = { $ne: zaloObjectId };
            break;
        }
      } else {
        switch (uidStatus) {
          case "found":
            query.uid = { $elemMatch: { uid: { $regex: /^\d+$/ } } };
            break;
          case "error":
            query.uid = { $elemMatch: { uid: { $not: /^\d+$/ } } };
            break;
          case "pending":
            query.uid = { $size: 0 };
            break;
        }
      }
    }
    // -- KẾT THÚC THAY ĐỔI --

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

    const [clientsFromDB, totalClients] = await Promise.all([
      clientsQuery,
      Client.countDocuments(query),
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
    const statuses = await Status.find({}).lean();
    const sortedStatuses = statuses.sort((a, b) => {
      const matchA = a.name.match(/^QT(\d+)\|/);
      const matchB = b.name.match(/^QT(\d+)\|/);
      const orderA = matchA ? parseInt(matchA[1], 10) : Infinity;
      const orderB = matchB ? parseInt(matchB[1], 10) : Infinity;
      if (orderA !== orderB) {
        return orderA - orderB;
      }
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
