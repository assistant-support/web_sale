// web_tslhu/app/actions/customerActions.js
"use server";

import connectDB from "@/config/connectDB";
import Customer from "@/models/customer";
import { getHistoryForCustomer } from "./historyActions"; // Tái sử dụng action đã có

/**
 * Lấy chi tiết đầy đủ của một khách hàng, bao gồm cả lịch sử hành động.
 * @param {string} customerId - ID của khách hàng.
 * @returns {Promise<object|null>} - Object chi tiết khách hàng hoặc null nếu không tìm thấy.
 */
export async function getCustomerDetails(customerId) {
  try {
    await connectDB();
    const customerData = await Customer.findById(customerId)
      .populate("status")
      .lean();

    if (!customerData) {
      return null;
    }

    const historyData = await getHistoryForCustomer(customerId);

    const fullDetails = {
      ...customerData,
      _id: customerData._id.toString(),
      status: customerData.status
        ? {
            ...customerData.status,
            _id: customerData.status._id.toString(),
          }
        : null,
      label: customerData.label?.toString(),
      history: historyData, // Gắn lịch sử vào
    };

    return JSON.parse(JSON.stringify(fullDetails));
  } catch (error) {
    console.error("Lỗi khi lấy chi tiết khách hàng:", error);
    return null;
  }
}
