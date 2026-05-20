import { Schema, model, models } from 'mongoose';
import { TREATMENT_DOCTOR_TYPES } from '@/lib/treatmentDoctor.constants';

const TreatmentDoctorSchema = new Schema(
    {
        name: { type: String, required: true, trim: true },
        type: {
            type: String,
            required: true,
            enum: Object.values(TREATMENT_DOCTOR_TYPES),
            default: TREATMENT_DOCTOR_TYPES.LIEU_TRINH,
        },
        expertise: { type: String, trim: true },
        note: { type: String, trim: true },
    },
    { timestamps: true }
);

TreatmentDoctorSchema.index({ name: 1, type: 1 }, { unique: true });

const TreatmentDoctor = models.TreatmentDoctor || model('TreatmentDoctor', TreatmentDoctorSchema);
export default TreatmentDoctor;
