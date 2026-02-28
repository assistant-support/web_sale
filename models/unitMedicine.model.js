import { Schema, model, models } from 'mongoose';

const UnitMedicineSchema = new Schema(
    {
        name: { type: String, required: true, trim: true, unique: true },
        note: { type: String, trim: true },
    },
    { timestamps: true }
);

const UnitMedicine = models.UnitMedicine || model('UnitMedicine', UnitMedicineSchema);
export default UnitMedicine;

