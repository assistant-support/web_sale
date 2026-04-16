import { Schema, model, models } from 'mongoose';

const LabelCallSchema = new Schema(
    {
        name: {
            type: String,
            required: true,
            trim: true,
            maxlength: 120,
        },
    },
    { timestamps: false, versionKey: false, collection: 'labelCall' }
);

LabelCallSchema.index({ name: 1 }, { unique: true });

const LabelCall = models.labelCall || model('labelCall', LabelCallSchema);
export default LabelCall;
