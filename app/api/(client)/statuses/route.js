// Tạo một file mới, ví dụ: /app/api/statuses/route.js

import { NextResponse } from "next/server";
import dbConnect from "@/config/connectDB";
import Status from "@/models/status"; // Import model Status bạn vừa tạo
import Customer from "@/models/customer"; // Import Customer để kiểm tra trước khi xóa
import { revalidateTag } from "next/cache";

// --- LẤY TẤT CẢ TRẠNG THÁI ---
export async function GET() {
  await dbConnect();
  try {
    const statuses = await Status.find({}).sort({ createdAt: 1 }).lean();
    return NextResponse.json({ success: true, data: statuses });
  } catch (error) {
    return NextResponse.json(
      { success: false, message: "Lỗi Server", error: error.message },
      { status: 500 },
    );
  }
}

// --- TẠO MỘT TRẠNG THÁI MỚI ---
export async function POST(request) {
  await dbConnect();
  try {
    const { name, color } = await request.json();

    if (!name) {
      return NextResponse.json(
        { success: false, message: "Tên trạng thái là bắt buộc." },
        { status: 400 },
      );
    }

    // Tạo mới status
    const newStatus = await Status.create({ name, color });

    return NextResponse.json(
      { success: true, message: "Tạo trạng thái thành công!", data: newStatus },
      { status: 201 },
    );
  } catch (error) {
    // Bắt lỗi nếu tên trạng thái bị trùng
    if (error.code === 11000) {
      return NextResponse.json(
        {
          success: false,
          message: `Trạng thái "${error.keyValue.name}" đã tồn tại.`,
        },
        { status: 409 },
      );
    }
    return NextResponse.json(
      { success: false, message: "Lỗi Server", error: error.message },
      { status: 500 },
    );
  }
}

// --- CẬP NHẬT MỘT TRẠNG THÁI ---

export async function PUT(request) {
  await dbConnect();
  try {
    // Chỉ nhận _id và name để cập nhật
    const { _id, name } = await request.json();

    if (!_id) {
      return NextResponse.json(
        { success: false, message: "Cần có ID để cập nhật." },
        { status: 400 },
      );
    }
    if (!name || name.trim() === "") {
      return NextResponse.json(
        { success: false, message: "Tên trạng thái không được để trống." },
        { status: 400 },
      );
    }

    const updatedStatus = await Status.findByIdAndUpdate(
      _id,
      { name: name.trim() }, // Cập nhật tên mới
      { new: true, runValidators: true },
    );

    if (!updatedStatus) {
      return NextResponse.json(
        { success: false, message: "Không tìm thấy trạng thái." },
        { status: 404 },
      );
    }

    // Thêm revalidateTag để cập nhật danh sách ở client
    revalidateTag("get_statuses");

    return NextResponse.json({
      success: true,
      message: "Cập nhật thành công!",
      data: updatedStatus,
    });
  } catch (error) {
    // Bắt lỗi nếu tên trạng thái mới bị trùng
    if (error.code === 11000) {
      return NextResponse.json(
        {
          success: false,
          message: `Trạng thái "${error.keyValue.name}" đã tồn tại.`,
        },
        { status: 409 },
      );
    }
    return NextResponse.json(
      { success: false, message: "Lỗi Server", error: error.message },
      { status: 500 },
    );
  }
}

// --- XÓA MỘT TRẠNG THÁI ---
export async function DELETE(request) {
  await dbConnect();
  try {
    const { _id } = await request.json();

    if (!_id) {
      return NextResponse.json(
        { success: false, message: "Cần có ID để xóa." },
        { status: 400 },
      );
    }

    // BƯỚC 1: Cập nhật tất cả khách hàng đang dùng trạng thái này
    // Đặt trường 'status' của họ về rỗng (bằng cách xóa nó đi)
    await Customer.updateMany(
      { status: _id }, // Tìm tất cả khách hàng có status này
      { $unset: { status: "" } }, // Xóa trường status của họ
    );

    // BƯỚC 2: Sau khi đã cập nhật khách hàng, tiến hành xóa trạng thái
    const deletedStatus = await Status.findByIdAndDelete(_id);

    if (!deletedStatus) {
      return NextResponse.json(
        { success: false, message: "Không tìm thấy trạng thái." },
        { status: 404 },
      );
    }

    return NextResponse.json({
      success: true,
      message: "Xóa trạng thái và cập nhật khách hàng thành công!",
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, message: "Lỗi Server", error: error.message },
      { status: 500 },
    );
  }
}
