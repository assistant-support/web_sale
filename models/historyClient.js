import { Schema, model, models } from "mongoose";

const recipientStatusSchema = new Schema(
  {
    phone: { type: String, required: true },
    name: { type: String },
    status: { type: String, required: true, enum: ["success", "failed"] },
    details: { type: String, default: "" },
    processedAt: { type: Date, default: Date.now },
  },
  { _id: false },
);

const sendHistorySchema = new Schema(
  {
    jobId: {
      type: Schema.Types.ObjectId,
      ref: "scheduledjob",
      required: true,
      unique: true,
    },
    jobName: { type: String },
    actionType: { type: String },
    sentBy: { type: Schema.Types.ObjectId, ref: "user" },
    message: { type: String },
    recipients: { type: [recipientStatusSchema], default: [] },
  },
  { timestamps: true },
);

sendHistorySchema.index({ sentBy: 1, createdAt: -1 });

const SendHistory =
  models.SendHistory || model("SendHistory", sendHistorySchema);
export default SendHistory;
