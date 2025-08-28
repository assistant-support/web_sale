// models/lock.js
import { Schema, model, models } from "mongoose";

const LockSchema = new Schema({
  _id: { type: String, required: true }, // Sẽ là 'cron_lock'
  isLocked: { type: Boolean, default: false },
  lockedAt: { type: Date },
});

const Lock = models.lock || model("lock", LockSchema);

export default Lock;
