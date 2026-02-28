import { medicine_data, unitMedicine_data, treatmentDoctor_data } from '@/app/actions/treatment.actions';
import TreatmentManager from './ui/TreatmentManager';

export default async function TreatmentPage() {
    const [medicines, unitMedicines, treatmentDoctors] = await Promise.all([
        medicine_data(),
        unitMedicine_data(),
        treatmentDoctor_data(),
    ]);

    return (
        <main className="flex h-full flex-col">
            <div className="w-full bg-white rounded-md">
                <TreatmentManager 
                    medicines={medicines || []} 
                    unitMedicines={unitMedicines || []} 
                    treatmentDoctors={treatmentDoctors || []} 
                />
            </div>
        </main>
    );
}

