import { Schema, model, models } from "mongoose";

const TaskSchema = new Schema({
  person: {
    type: {
      name: String,
      phone: String,
      // ** MODIFIED: Thay đổi kiểu dữ liệu để chấp nhận mảng uid
      uid: Schema.Types.Mixed,
    },
    required: true,
  },
  status: {
    type: String,
    enum: ["pending", "processing", "completed", "failed"],
    default: "pending",
  },
  processingId: {
    type: String,
    default: null,
    index: true,
  },
  processedAt: {
    type: Date,
  },
  resultMessage: {
    type: String,
  },
  scheduledFor: { type: Date, required: true },
});

const ScheduledJobSchema = new Schema(
  {
    jobName: {
      type: String,
      required: [true, "Vui lòng nhập tên lịch trình."],
      trim: true,
    },
    status: {
      type: String,
      enum: ["scheduled", "processing", "completed", "failed", "paused"],
      default: "scheduled",
    },
    actionType: {
      type: String,
      enum: ["sendMessage", "addFriend", "findUid"],
      required: true,
    },
    zaloAccount: {
      type: Schema.Types.ObjectId,
      ref: "zaloaccount",
      required: true,
    },

    config: {
      messageTemplate: String,
      actionsPerHour: {
        type: Number,
        required: true,
        min: 1,
      },
    },

    tasks: [TaskSchema],

    statistics: {
      total: { type: Number, default: 0 },
      completed: { type: Number, default: 0 },
      failed: { type: Number, default: 0 },
    },
    estimatedCompletionTime: {
      type: Date,
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: "user",
      required: true,
    },
    lastExecutionResult: {
      type: String,
      default: null,
    },
  },
  {
    timestamps: true,
  },
);

const ScheduledJob =
  models.scheduledjob || model("scheduledjob", ScheduledJobSchema);

export default ScheduledJob;
