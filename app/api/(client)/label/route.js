import { NextResponse } from "next/server";
import dbConnect from "@/config/connectDB";
import Label from "@/models/label";
import { Re_Label } from "@/data/customer";

/* ================================================================== */
/* POST (Tạo mới)                        */
/* ================================================================== */
export async function POST(req) {
  try {
    await dbConnect();

    const { title, content, desc } = await req.json();

    if (!title || !content) {
      return NextResponse.json(
        { status: 1, data: [], mes: "Thiếu tiêu đề hoặc nội dung!" },
        { status: 400 },
      );
    }

    const trimmedTitle = title.trim();
    const existed = await Label.findOne({ title: trimmedTitle }).lean();

    if (existed) {
      return NextResponse.json(
        { status: 1, data: [], mes: "Tiêu đề đã tồn tại!" },
        { status: 409 }, // 409 Conflict
      );
    }

    const newLabel = await Label.create({
      title: trimmedTitle,
      content: content.trim(),
      desc: desc ? desc.trim() : "",
    });
    Re_Label();
    return NextResponse.json(
      { status: 2, data: newLabel, mes: "Tạo nhãn thành công!" },
      { status: 201 },
    );
  } catch (err) {
    console.error("[LABEL_CREATE_ERROR]", err);
    return NextResponse.json(
      { status: 1, data: [], mes: "Lỗi máy chủ" },
      { status: 500 },
    );
  }
}

/* ================================================================== */
/* GET (Lấy tất cả)                      */
/* ================================================================== */
export async function GET() {
  try {
    await dbConnect();

    const labels = await Label.find().sort({ createdAt: -1 }).lean();

    return NextResponse.json(
      { status: 2, data: labels, mes: "Lấy danh sách nhãn thành công" },
      { status: 200 },
    );
  } catch (err) {
    console.error("[LABEL_GET_ERROR]", err);
    return NextResponse.json(
      { status: 1, data: [], mes: "Lỗi máy chủ" },
      { status: 500 },
    );
  }
}

/* ================================================================== */
/* PUT (Cập nhật)                        */
/* ================================================================== */
export async function PUT(req) {
  try {
    await dbConnect();

    const { _id, title, desc, content } = await req.json();

    if (!_id) {
      return NextResponse.json(
        { status: 1, data: [], mes: "Thiếu ID của nhãn để cập nhật." },
        { status: 400 },
      );
    }
    if (!title || !title.trim()) {
      return NextResponse.json(
        { status: 1, data: [], mes: "Tiêu đề không được để trống." },
        { status: 400 },
      );
    }

    const trimmedTitle = title.trim();

    // Kiểm tra xem tiêu đề mới có trùng với một nhãn nào khác không
    const existingLabelWithSameTitle = await Label.findOne({
      title: trimmedTitle,
      _id: { $ne: _id }, // $ne (not equal) - tìm các document khác với _id hiện tại
    }).lean();

    if (existingLabelWithSameTitle) {
      return NextResponse.json(
        {
          status: 1,
          data: [],
          mes: "Tiêu đề này đã được sử dụng bởi một nhãn khác.",
        },
        { status: 409 }, // 409 Conflict
      );
    }

    const updatedLabel = await Label.findByIdAndUpdate(
      _id,
      {
        title: trimmedTitle,
        desc: desc ? desc.trim() : "",
        content: content ? content.trim() : "",
      },
      { new: true, runValidators: true }, // new: true trả về document sau khi đã cập nhật
    ).lean();

    if (!updatedLabel) {
      return NextResponse.json(
        { status: 1, data: [], mes: "Không tìm thấy nhãn để cập nhật." },
        { status: 404 },
      );
    }
    Re_Label();
    return NextResponse.json(
      { status: 2, data: updatedLabel, mes: "Cập nhật nhãn thành công!" },
      { status: 200 },
    );
  } catch (err) {
    console.error("[LABEL_UPDATE_ERROR]", err);
    return NextResponse.json(
      { status: 1, data: [], mes: "Lỗi máy chủ" },
      { status: 500 },
    );
  }
}
