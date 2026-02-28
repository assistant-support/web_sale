import { Schema, model, models } from 'mongoose';

const DiscountProgramSchema = new Schema(
    {
        name: {
            type: String,
            required: [true, 'Tên chương trình khuyến mãi là bắt buộc'],
            trim: true,
        },
        discount_value: {
            type: Number,
            required: [true, 'Giá trị giảm là bắt buộc'],
            min: [0, 'Giá trị giảm phải >= 0'],
        },
        discount_unit: {
            type: String,
            enum: ['none', 'amount', 'percent'],
            default: 'none',
            required: true,
        },
        note: {
            type: String,
            trim: true,
            default: '',
        },
    },
    {
        timestamps: true,
        versionKey: false,
    }
);

// Index để tìm kiếm nhanh
DiscountProgramSchema.index({ name: 1 });

const DiscountProgram = models.discountprogram || model('discountprogram', DiscountProgramSchema);

export default DiscountProgram;

