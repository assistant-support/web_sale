// File: models/archivedJob.js
import { Schema, model, models } from "mongoose";

const ArchivedJobSchema = new Schema(
  {
    // Ra lệnh cho Mongoose sử dụng ID mà chúng ta cung cấp
    _id: {
      type: Schema.Types.ObjectId,
      required: true,
    },
    jobName: {
      type: String,
      required: true,
      trim: true,
    },
    status: {
      type: String,
      enum: ["scheduled", "processing", "completed", "failed", "paused"],
      required: true,
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
      actionsPerHour: Number,
    },
    statistics: {
      total: { type: Number, default: 0 },
      completed: { type: Number, default: 0 },
      failed: { type: Number, default: 0 },
    },
    createdAt: { type: Date, required: true },
    completedAt: { type: Date, default: Date.now },
    estimatedCompletionTime: Date,
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
    // Tắt việc tự động tạo _id
    _id: false,
    timestamps: { createdAt: false, updatedAt: "updatedAt" },
  },
);

const ArchivedJob =
  models.archivedjob || model("archivedjob", ArchivedJobSchema);

export default ArchivedJob;
