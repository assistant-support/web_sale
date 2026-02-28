import { Schema, model, models } from 'mongoose';
import { normalize } from '@/utils/normalize';

const MedicineSchema = new Schema(
    {
        name: { type: String, required: true, trim: true, unique: true },
        nameSearch: { type: String, index: true, trim: true },
        note: { type: String, trim: true },
    },
    { timestamps: true }
);

// Middleware để tự động sinh nameSearch khi save
MedicineSchema.pre('save', function (next) {
    if (this.isModified('name')) {
        this.nameSearch = normalize(this.name);
    }
    next();
});

// Tạo index cho nameSearch
MedicineSchema.index({ nameSearch: 1 });

const Medicine = models.Medicine || model('Medicine', MedicineSchema);
export default Medicine;

