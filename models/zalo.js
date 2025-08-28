import { Schema, model, models } from "mongoose";

const ZaloAccountSchema = new Schema(
    {
        uid: { type: String, required: true, unique: true, trim: true },
        name: { type: String, required: true, trim: true },
        phone: { type: String, required: true },
        avt: { type: String },
        rateLimitPerHour: { type: Number, required: true, default: 30 },
        rateLimitPerDay: { type: Number, required: true, default: 200 },
        action: { type: [{ type: Schema.Types.ObjectId, ref: 'scheduledjob' }], default: [] },
        roles: {
            type: [{ type: Schema.Types.ObjectId, ref: 'user' }],
            default: []
        },
    },
    { timestamps: true },
);

const ZaloAccount =
    models.zaloaccount || model("zaloaccount", ZaloAccountSchema);

export default ZaloAccount;
