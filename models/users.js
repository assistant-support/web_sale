// models/users.js
import { Schema, model, models } from "mongoose";

/**
 * Schema cho một người dùng hệ thống (nhân viên).
 */
const UserSchema = new Schema(
  {
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    // Mật khẩu đã được mã hóa (hash).
    password: { type: String, required: true },
    // Lưu trữ CCCD hoặc mã nhân viên.
    iduser: { type: String, unique: true, sparse: true },
    // Vai trò của người dùng trong hệ thống.
    role: {
      type: String,
      enum: ["Admin", "Employee"],
      default: "Employee",
    },
    // Tham chiếu đến tài khoản Zalo mà người dùng đang "kích hoạt".
    zaloActive: {
      type: Schema.Types.ObjectId,
      ref: "zaloaccount",
      default: null,
    },
  },
  { timestamps: true },
);

const User = models.user || model("user", UserSchema);

export default User;
