// models/history.js
import { Schema, model, models } from "mongoose";

/**
 * Schema con để lưu trữ chi tiết về trạng thái của một hành động.
 */
const StatusDetailSchema = new Schema(
  {
    status: {
      type: String,
      enum: ["SUCCESS", "FAILED", "PENDING", "PROCESSING", "CANCELLED"],
      required: true,
    },
    detail: {
      type: Schema.Types.Mixed,
      default: null,
    },
  },
  { _id: false },
);

/**
 * Schema để ghi lại lịch sử các hành động của người dùng trong hệ thống.
 */
const ActionHistorySchema = new Schema(
  {
    action: {
      type: String,
      enum: [
        "USER_LOGIN",
        "USER_LOGOUT",
        "CREATE_SCHEDULE_FIND_UID",
        "CREATE_SCHEDULE_ADD_FRIEND",
        "CREATE_SCHEDULE_SEND_MESSAGE",
        "DELETE_SCHEDULE_FIND_UID",
        "DELETE_SCHEDULE_ADD_FRIEND",
        "DELETE_SCHEDULE_SEND_MESSAGE",
        "DO_SCHEDULE_FIND_UID",
        "DO_SCHEDULE_ADD_FRIEND",
        "DO_SCHEDULE_SEND_MESSAGE",
        "UPDATE_NAME_CUSTOMER",
        "UPDATE_STAGE_CUSTOMER",
        "UPDATE_STATUS_CUSTOMER",
        "UPDATE_ADMISSION_INFORMATION_CUSTOMER",
        "ADD_COMMENT_CUSTOMER",
        "CHOSE_ZALO_ACCOUNT",
        "AUTO_CANCEL_RATE_LIMIT",
      ],
      required: true,
    },
    user: {
      type: Schema.Types.ObjectId,
      ref: "user",
      required: true,
    },
    status: {
      type: StatusDetailSchema,
      required: true,
    },
    // (Tùy chọn) Đối tượng khách hàng bị tác động.
    customer: {
      type: Schema.Types.ObjectId,
      ref: "customer",
    },
    // (Tùy chọn) Tài khoản Zalo được sử dụng khi thực hiện hành động.
    zalo: {
      type: Schema.Types.ObjectId,
      ref: "zaloaccount",
    },
    // (Tùy chọn) Chứa các chi tiết bổ sung về hành động dưới dạng JSON.
    actionDetail: {
      type: Schema.Types.Mixed,
    },
  },
  { timestamps: { createdAt: "time" } },
);

const ActionHistory =
  models.actionhistory || model("actionhistory", ActionHistorySchema);

export default ActionHistory;
