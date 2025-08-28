// app/api/customer/route.js
import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { google } from "googleapis";
import { Types } from "mongoose";
import dbConnect from "@/config/connectDB";
import Customer from "@/models/customer";
import { getCurrentUser } from "@/lib/session";
import Status from "@/models/status";
import User from "@/models/users";
import jwt from "jsonwebtoken";
import { Data_Client } from "@/data/customer";
import { revalidateAndBroadcast } from "@/lib/revalidation";

import {
  logUpdateName,
  logUpdateStatus,
  logUpdateStage,
  logAddComment,
} from "@/app/actions/historyActions";
/* ─────────────── CONSTANTS ─────────────── */
const TAG = "customer_data";
/* ────────────────────────────────────────── */

/* Google Sheets client (readonly) */
async function getGoogleSheetsClient() {
  const scopes = ["https://www.googleapis.com/auth/spreadsheets.readonly"];
  const auth = new google.auth.GoogleAuth({
    credentials: {
      client_email: process.env.GOOGLE_CLIENT_EMAIL,
      private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
    },
    projectId: process.env.GOOGLE_PROJECT_ID,
    scopes,
  });
  return google.sheets({ version: "v4", auth });
}

/**
 * API endpoint này phục vụ cho việc tải thêm dữ liệu từ client.
 * Nó nhận các tham số (limit, skip, filter) từ URL và trả về dữ liệu tương ứng.
 */
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);

    // Chuyển URLSearchParams thành một object filters đơn giản
    const filters = Object.fromEntries(searchParams.entries());

    // Lấy limit và skip từ params, cung cấp giá trị mặc định
    const limit = parseInt(searchParams.get("limit")) || 100;
    const skip = parseInt(searchParams.get("skip")) || 0;

    const clientResponse = await Data_Client({ limit, skip, filters });

    return NextResponse.json(clientResponse);
  } catch (error) {
    console.error("API Error in /api/clients:", error);
    return NextResponse.json({ message: "Lỗi phía máy chủ." }, { status: 500 });
  }
}

/*───────────  POST (Hardcoded Sheet Info) ───────────*/
export async function POST(request) {
  await dbConnect();

  try {
    // Chỉ lấy các tham số động từ request body
    const { targetEmail, startRow } = await request.json();

    // Kiểm tra các tham số bắt buộc
    if (!targetEmail) {
      return NextResponse.json(
        { status: false, mes: "Vui lòng cung cấp targetEmail." },
        { status: 400 },
      );
    }

    // Gán cứng ID và Range của Google Sheet
    const spreadsheetId = "1H5Z1OJxzvk39vjtrdDYzESU61NV7DGPw6K_iD97nh7U";
    const range = "Data!A:K";

    // Thiết lập các hằng số động
    const DATA_START_ROW = Number(startRow) || 1; // Mặc định là 1 nếu không có hoặc không hợp lệ
    const TARGET_EMAIL = targetEmail.trim().toLowerCase();
    const COL_F_INDEX = 5; // Cột K (index 10)

    // --- BƯỚC 1: LẤY ID CỦA NHÂN VIÊN CẦN GÁN QUYỀN ---
    const authUser = await User.findOne({ email: TARGET_EMAIL })
      .select("_id")
      .lean();
    if (!authUser) {
      return NextResponse.json(
        {
          status: false,
          mes: `Không tìm thấy nhân viên với email: ${TARGET_EMAIL}`,
        },
        { status: 404 },
      );
    }
    const authIdToAssign = authUser._id;

    // --- BƯỚC 2: ĐỌC VÀ CHUẨN HÓA DỮ LIỆU TỪ GOOGLE SHEET ---
    const sheets = await getGoogleSheetsClient();
    const { data } = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range,
    });
    const rows = data.values ?? [];

    if (rows.length < DATA_START_ROW) {
      return NextResponse.json({
        status: true,
        mes: `Sheet chưa có tới dòng ${DATA_START_ROW}.`,
      });
    }

    const headers = rows[0].map((h) => h.trim());
    const dataRows = rows.slice(DATA_START_ROW - 1);

    const phoneIdx = headers.indexOf("phone");
    const parentPhoneIdx = headers.indexOf("Parent's Phone Number");
    const nameIdx = headers.indexOf("nameStudent");
    const uidIdx = headers.indexOf("uid");

    if (phoneIdx === -1 && parentPhoneIdx === -1) {
      return NextResponse.json(
        {
          status: false,
          mes: "Thiếu cột 'phone' hoặc 'Parent's Phone Number'.",
        },
        { status: 400 },
      );
    }

    // --- BƯỚC 3: LỌC & GOM DỮ LIỆU HỢP LỆ ---
    const processedPhones = new Set();
    const sheetRows = [];

    dataRows.forEach((row) => {
      let phone = (row[phoneIdx] || row[parentPhoneIdx] || "")
        .toString()
        .replace(/\s+/g, "");
      if (!phone) return;

      const len = phone.length;
      if (len < 9 || len > 11) return;
      if (len === 9 && phone[0] !== "0") phone = "0" + phone;
      if (len === 10 && phone[0] !== "0") return;
      if (len === 11 && phone.startsWith("84")) phone = "0" + phone.slice(2);
      else if (len === 11) return;
      if (phone.length !== 10) return;

      if (processedPhones.has(phone)) return;
      processedPhones.add(phone);

      const assignedEmail = (row[COL_F_INDEX] || "").trim().toLowerCase();
      sheetRows.push({
        phone,
        name: nameIdx !== -1 ? row[nameIdx] || "" : "",
        uid: uidIdx !== -1 ? row[uidIdx] || "" : "",
        needAuth: assignedEmail === TARGET_EMAIL,
      });
    });

    if (!sheetRows.length) {
      return NextResponse.json({
        status: true,
        mes: "Không tìm thấy số điện thoại hợp lệ trong vùng dữ liệu đã chọn.",
      });
    }

    // --- BƯỚC 4: TÁCH DỮ LIỆU MỚI VS. ĐÃ TỒN TẠI ---
    const phoneArr = [...processedPhones];
    const existingCustomers = await Customer.find({ phone: { $in: phoneArr } })
      .select("phone auth")
      .lean();
    const existingCustomerMap = new Map(
      existingCustomers.map((c) => [c.phone, c]),
    );

    // --- BƯỚC 5: PHÂN LOẠI INSERT / UPDATE ---
    const docsToInsert = [];
    const phonesToUpdateAuth = [];

    sheetRows.forEach((r) => {
      const existingCustomer = existingCustomerMap.get(r.phone);

      if (existingCustomer) {
        const isAuthAssigned = existingCustomer.auth?.some(
          (id) => id.toString() === authIdToAssign.toString(),
        );
        if (r.needAuth && !isAuthAssigned) {
          phonesToUpdateAuth.push(r.phone);
        }
      } else {
        const doc = { phone: r.phone, uid: r.uid, name: r.name };
        if (r.needAuth) {
          doc.auth = [authIdToAssign];
        }
        docsToInsert.push(doc);
      }
    });

    // --- BƯỚC 6: THỰC THI LỆNH ---
    let insertedCount = 0;
    if (docsToInsert.length) {
      try {
        const inserted = await Customer.insertMany(docsToInsert, {
          ordered: false,
        });
        insertedCount = inserted.length;
      } catch (err) {
        if (err.code === 11000) {
          insertedCount = err.result.nInserted || 0;
        } else {
          throw err;
        }
      }
    }

    let updatedCount = 0;
    if (phonesToUpdateAuth.length) {
      const res = await Customer.updateMany(
        { phone: { $in: phonesToUpdateAuth } },
        { $addToSet: { auth: authIdToAssign } },
      );
      updatedCount = res.modifiedCount || 0;
    }

    // --- BƯỚC 7: HOÀN TẤT ---
    revalidateAndBroadcast("customer_data");
    return NextResponse.json(
      {
        status: true,
        mes: `Đã thêm ${insertedCount} KH mới và cập nhật quyền cho ${updatedCount} KH cũ.`,
      },
      { status: 200 },
    );
  } catch (error) {
    console.error("POST Error:", error);
    return NextResponse.json(
      {
        status: false,
        mes: "Đã xảy ra lỗi phía server.",
        error: error.message,
      },
      { status: 500 },
    );
  }
}

export async function PUT(request) {
  await dbConnect();
  try {
    const body = await request.json();
    const { _id, status, ...otherFields } = body;

    if (!_id) {
      return NextResponse.json(
        { status: false, message: "_id is required for update." },
        { status: 400 },
      );
    }

    // --- BƯỚC 1: TÍNH TOÁN STAGE LEVEL (LOGIC CŨ CỦA BẠN) ---
    let stageLevel = 0;
    if (otherFields.study) {
      stageLevel = 3;
    } else if (otherFields.studyTry) {
      stageLevel = 2;
    } else if (otherFields.care) {
      stageLevel = 1;
    }

    // Gán giá trị stageLevel và các trường khác vào lệnh $set
    const updateOperation = {
      $set: {
        ...otherFields,
        stageLevel: stageLevel,
      },
    };

    // --- BƯỚC 2: XỬ LÝ TRẠNG THÁI ĐỘNG (LOGIC MỚI) ---
    if (status && status.trim() !== "") {
      // Nếu có status ID hợp lệ, thêm nó vào lệnh $set
      updateOperation.$set.status = status;
    } else {
      // Nếu status là rỗng, thêm lệnh $unset để xóa trường này
      updateOperation.$unset = { status: 1 };
    }

    // --- BƯỚC 3: THỰC THI LỆNH CẬP NHẬT ---
    const updatedCustomer = await Customer.findByIdAndUpdate(
      _id,
      updateOperation,
      { new: true },
    ).lean();

    if (!updatedCustomer) {
      return NextResponse.json(
        { status: false, message: "Customer not found." },
        { status: 404 },
      );
    }

    revalidateAndBroadcast("customer_data");
    return NextResponse.json({ status: true, data: updatedCustomer });
  } catch (error) {
    if (error.name === "CastError") {
      return NextResponse.json(
        {
          status: false,
          message:
            "Lỗi định dạng dữ liệu, có thể do ID trạng thái không hợp lệ.",
          error: error.message,
        },
        { status: 400 },
      );
    }
    return NextResponse.json(
      { status: false, message: "Server Error", error: error.message },
      { status: 500 },
    );
  }
}

// Thêm import getCurrentUser để lấy thông tin người dùng an toàn

export async function PATCH(request) {
  await dbConnect();

  try {
    const currentUser = await getCurrentUser();
    if (!currentUser) {
      return NextResponse.json(
        { status: false, message: "Yêu cầu đăng nhập." },
        { status: 401 },
      );
    }

    const body = await request.json();
    const { customerId, updateData } = body;

    // --- Kiểm tra đầu vào (không đổi) ---
    if (!customerId || !Types.ObjectId.isValid(customerId)) {
      return NextResponse.json(
        { status: false, message: "ID khách hàng không hợp lệ." },
        { status: 400 },
      );
    }
    if (
      !updateData ||
      typeof updateData !== "object" ||
      Object.keys(updateData).length === 0
    ) {
      return NextResponse.json(
        { status: false, message: "Vui lòng cung cấp dữ liệu." },
        { status: 400 },
      );
    }

    // --- Lấy trạng thái cũ của khách hàng để ghi log ---
    const oldCustomer = await Customer.findById(customerId)
      .populate("status")
      .lean();
    if (!oldCustomer) {
      return NextResponse.json(
        { status: false, message: "Không tìm thấy khách hàng." },
        { status: 404 },
      );
    }

    let updateOperation;
    let newCommentData = null;

    // --- Phân loại hành động ---
    if (updateData._comment) {
      // Xử lý thêm bình luận mới
      const newComment = {
        user: currentUser._id,
        stage: oldCustomer.stageLevel,
        detail: updateData._comment.trim(),
      };
      updateOperation = {
        $push: { comments: { $each: [newComment], $sort: { time: -1 } } },
      };
      newCommentData = newComment;

      // START: THÊM LOGIC XÓA TRẠNG THÁI
    } else if (updateData.status === null) {
      // Xử lý xóa trạng thái
      // Nếu status được gán giá trị null, chúng ta sẽ unset (xóa) trường này khỏi DB
      updateOperation = { $unset: { status: "" } };
      // END: THÊM LOGIC XÓA TRẠNG THÁI
    } else {
      // Xử lý cập nhật các trường thông thường
      updateOperation = { $set: updateData };
    }

    // --- Thực thi cập nhật ---
    const updatedCustomer = await Customer.findByIdAndUpdate(
      customerId,
      updateOperation,
      { new: true },
    )
      .populate("status")
      .populate({ path: "comments.user", select: "name" })
      .lean();

    if (!updatedCustomer) throw new Error("Cập nhật thất bại.");

    // --- Ghi lại lịch sử hành động ---
    if (updateData.name) {
      await logUpdateName(
        currentUser,
        customerId,
        oldCustomer.name,
        updatedCustomer.name,
      );
    }
    // Logic ghi log cho trạng thái giờ đây xử lý được cả cập nhật và xóa
    if (updateData.status !== undefined) {
      await logUpdateStatus(
        currentUser,
        customerId,
        oldCustomer.status?.name || "Chưa có",
        updatedCustomer.status?.name || "Chưa có",
      );
    }
    if (updateData.stageLevel !== undefined) {
      await logUpdateStage(
        currentUser,
        customerId,
        oldCustomer.stageLevel,
        updatedCustomer.stageLevel,
      );
    }
    if (newCommentData) {
      const addedComment = updatedCustomer.comments.find(
        (c) =>
          c.detail === newCommentData.detail &&
          c.user._id.toString() === currentUser._id.toString(),
      );
      if (addedComment)
        await logAddComment(currentUser, customerId, addedComment);
    }
    revalidateAndBroadcast("customer_data");
    return NextResponse.json({ status: true, data: updatedCustomer });
  } catch (error) {
    console.error("PATCH Error:", error);
    return NextResponse.json(
      { status: false, message: "Lỗi phía máy chủ.", error: error.message },
      { status: 500 },
    );
  }
}
