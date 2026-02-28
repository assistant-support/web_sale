import { Schema, model, models } from 'mongoose';

const TreatmentDoctorSchema = new Schema(
    {
        name: { type: String, required: true, trim: true, unique: true },
        expertise: { type: String, trim: true },
        note: { type: String, trim: true },
    },
    { timestamps: true }
);

const TreatmentDoctor = models.TreatmentDoctor || model('TreatmentDoctor', TreatmentDoctorSchema);
export default TreatmentDoctor;

