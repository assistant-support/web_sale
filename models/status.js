import { Schema, model, models } from 'mongoose';

const StatusSchema = new Schema(
    {
        name: {
            type: String,
            required: [true, 'Tên trạng thái là bắt buộc.'],
            unique: true,
            trim: true
        },
        description: { type: String, trim: true }
    },
    { timestamps: true }
);

const Status = models.status || model('status', StatusSchema);

export default Status;