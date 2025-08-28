import { NextResponse } from "next/server";
import { isValidObjectId } from "mongoose";
import connectToDatabase from "@/config/connectDB";
import User from "@/models/users";
import ZaloAccount from "@/models/zalo";
import authenticate from "@/utils/authenticate";
import { Re_acc, Re_user } from "@/data/users";

export async function POST(request) {
  try {
    await connectToDatabase();
    const { user, body } = await authenticate(request);

    if (!user) {
      return NextResponse.json({
        status: 1,
        mes: "Xác thực không thành công.",
        data: null,
      });
    }

    const { zaloAccountId } = body;

    if (zaloAccountId) {
      if (!isValidObjectId(zaloAccountId)) {
        return NextResponse.json(
          { status: 1, mes: "ID tài khoản Zalo không hợp lệ.", data: null },
          { status: 400 },
        );
      }

      const accountToSelect = await ZaloAccount.findById(zaloAccountId);

      if (!accountToSelect) {
        return NextResponse.json(
          { status: 1, mes: "Không tìm thấy tài khoản Zalo này.", data: null },
          { status: 404 },
        );
      }

      if (accountToSelect.user && accountToSelect.user.toString() !== user.id) {
        return NextResponse.json(
          {
            status: 1,
            mes: "Tài khoản Zalo này đã được người khác chọn.",
            data: null,
          },
          { status: 409 },
        );
      }

      await User.findByIdAndUpdate(user.id, { $set: { zalo: zaloAccountId } });
      await ZaloAccount.findByIdAndUpdate(zaloAccountId, {
        $set: { user: user.id },
      });
      Re_user();
      Re_acc();
      return NextResponse.json({
        status: 2,
        mes: `Đã chọn tài khoản ${accountToSelect.name}.`,
        data: accountToSelect,
      });
    } else {
      const currentUser = await User.findById(user.id);
      const currentZaloId = currentUser?.zalo;

      if (currentZaloId) {
        await User.findByIdAndUpdate(user.id, { $unset: { zalo: "" } });
        await ZaloAccount.findByIdAndUpdate(currentZaloId, {
          $set: { user: null },
        });
      }
      Re_user();
      Re_acc();
      return NextResponse.json({
        status: 2,
        mes: "Đã bỏ chọn tài khoản Zalo.",
        data: null,
      });
    }
  } catch (error) {
    return NextResponse.json(
      { status: 0, mes: "Đã xảy ra lỗi không xác định.", data: error.message },
      { status: 500 },
    );
  }
}
