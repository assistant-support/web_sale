import { Schema, model, models } from "mongoose";

// ++ ADDED: Định nghĩa schema con cho mỗi mục UID
const UidEntrySchema = new Schema(
  {
    zaloId: {
      type: Schema.Types.ObjectId,
      ref: "zaloaccount",
      required: true,
    },
    uid: {
      type: String,
      required: true,
    },
  },
  { _id: false },
);

const ActionRefSchema = new Schema(
  {
    job: { type: Schema.Types.ObjectId, ref: "scheduledjob", required: true },
    zaloAccount: {
      type: Schema.Types.ObjectId,
      ref: "zaloaccount",
      required: true,
    },
    actionType: {
      type: String,
      enum: ["sendMessage", "addFriend", "findUid"],
      required: true,
    },
    status: {
      type: String,
      enum: ["pending", "processing", "completed", "failed"],
      default: "pending",
    },
  },
  { _id: false },
);

/**
 * Schema con cho mỗi bình luận trong hồ sơ khách hàng.
 */
const CommentSchema = new Schema({
  // Người dùng (nhân viên) đã tạo bình luận.
  user: {
    type: Schema.Types.ObjectId,
    ref: "user",
    required: true,
  },
  // Giai đoạn của khách hàng tại thời điểm bình luận.
  stage: {
    type: Number,
    required: true,
  },
  // Nội dung chi tiết của bình luận.
  detail: {
    type: String,
    required: true,
  },
  // Thời điểm tạo bình luận, mặc định là bây giờ.
  time: {
    type: Date,
    default: Date.now,
  },
});

/**
 * Schema chính cho Khách hàng (Customer).
 */
const CustomerSchema = new Schema(
  {
    name: { type: String },
    phone: { type: String, required: true },
    // ** MODIFIED: Thay đổi cấu trúc của trường uid
    uid: {
      type: [UidEntrySchema],
      default: [],
    },
    status: {
      type: Schema.Types.ObjectId,
      ref: "status",
    },
    stageLevel: { type: Number, default: 0 },

    // Mảng lưu trữ các bình luận/ghi chú về quá trình chăm sóc.
    comments: [CommentSchema],

    // Mảng chứa các nhân viên được gán để chăm sóc khách hàng này.
    users: [{ type: Schema.Types.ObjectId, ref: "user" }],
    action: [ActionRefSchema],
  },
  {
    timestamps: true,
    strict: false,
  },
);

const Customer = models.customer || model("customer", CustomerSchema);
export default Customer;
