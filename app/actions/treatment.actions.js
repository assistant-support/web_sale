'use server';

import dbConnect from "@/config/connectDB";
import Medicine from "@/models/medicine.model";
import UnitMedicine from "@/models/unitMedicine.model";
import TreatmentDoctor from "@/models/treatmentDoctor.model";
import checkAuthToken from "@/utils/checktoken";
import { unstable_cache as nextCache, revalidateTag } from 'next/cache';

// ==================== MEDICINE ====================
export async function medicine_data() {
    const cachedData = nextCache(
        async () => {
            await dbConnect();
            const medicines = await Medicine.find({}).sort({ createdAt: -1 }).lean();
            return JSON.parse(JSON.stringify(medicines));
        },
        ['medicine-data'],
        { tags: ['medicine'] }
    );
    return cachedData();
}

export async function createMedicineAction(_previousState, formData) {
    if (!formData || typeof formData.get !== 'function') {
        return { message: 'Dữ liệu không hợp lệ.', status: false };
    }

    await dbConnect();
    const name = formData.get('name');
    const note = formData.get('note') || '';

    const user = await checkAuthToken();
    if (!user || !user.id) {
        return { message: 'Bạn cần đăng nhập để thực hiện hành động này.', status: false };
    }
    if (!user.role.includes('Admin') && !user.role.includes('Sale') && !user.role.includes('Manager')) {
        return { message: 'Bạn không có quyền thực hiện chức năng này', status: false };
    }

    if (!name || !name.toString().trim()) {
        return { message: 'Tên thuốc là bắt buộc.', status: false };
    }

    try {
        const medicine = new Medicine({
            name: name.toString().trim(),
            note: note.toString().trim(),
        });
        await medicine.save();
        revalidateTag('medicine');
        return { message: `Đã thêm thuốc "${medicine.name}" thành công.`, status: true };
    } catch (error) {
        if (error.code === 11000) {
            return { message: 'Tên thuốc đã tồn tại.', status: false };
        }
        console.error("Lỗi thêm thuốc:", error);
        return { message: 'Lỗi hệ thống, không thể thêm thuốc.', status: false };
    }
}

export async function updateMedicineAction(_previousState, formData) {
    if (!formData || typeof formData.get !== 'function') {
        return { message: 'Dữ liệu không hợp lệ.', status: false };
    }

    await dbConnect();
    const id = formData.get('id');
    const name = formData.get('name');
    const note = formData.get('note') || '';

    const user = await checkAuthToken();
    if (!user || !user.id) {
        return { message: 'Bạn cần đăng nhập để thực hiện hành động này.', status: false };
    }
    if (!user.role.includes('Admin') && !user.role.includes('Sale') && !user.role.includes('Manager')) {
        return { message: 'Bạn không có quyền thực hiện chức năng này', status: false };
    }

    if (!id) {
        return { message: 'ID thuốc không hợp lệ.', status: false };
    }

    if (!name || !name.toString().trim()) {
        return { message: 'Tên thuốc là bắt buộc.', status: false };
    }

    try {
        const medicine = await Medicine.findByIdAndUpdate(
            id,
            {
                name: name.toString().trim(),
                note: note.toString().trim(),
            },
            { new: true, runValidators: true }
        );

        if (!medicine) {
            return { message: 'Không tìm thấy thuốc để cập nhật.', status: false };
        }

        revalidateTag('medicine');
        return { message: `Đã cập nhật thuốc "${medicine.name}" thành công.`, status: true };
    } catch (error) {
        if (error.code === 11000) {
            return { message: 'Tên thuốc đã tồn tại.', status: false };
        }
        console.error("Lỗi cập nhật thuốc:", error);
        return { message: 'Lỗi hệ thống, không thể cập nhật thuốc.', status: false };
    }
}

export async function deleteMedicineAction(_previousState, formData) {
    if (!formData || typeof formData.get !== 'function') {
        return { message: 'Dữ liệu không hợp lệ.', status: false };
    }

    await dbConnect();
    const id = formData.get('id');

    const user = await checkAuthToken();
    if (!user || !user.id) {
        return { message: 'Bạn cần đăng nhập để thực hiện hành động này.', status: false };
    }
    if (!user.role.includes('Admin') && !user.role.includes('Sale') && !user.role.includes('Manager')) {
        return { message: 'Bạn không có quyền thực hiện chức năng này', status: false };
    }

    if (!id) {
        return { message: 'ID thuốc không hợp lệ.', status: false };
    }

    try {
        const deletedMedicine = await Medicine.findByIdAndDelete(id);
        if (!deletedMedicine) {
            return { message: 'Không tìm thấy thuốc để xóa.', status: false };
        }

        revalidateTag('medicine');
        return { message: `Đã xóa thành công thuốc "${deletedMedicine.name}".`, status: true };
    } catch (error) {
        console.error("Lỗi xóa thuốc:", error);
        return { message: 'Lỗi hệ thống, không thể xóa.', status: false };
    }
}

// ==================== UNIT MEDICINE ====================
export async function unitMedicine_data() {
    const cachedData = nextCache(
        async () => {
            await dbConnect();
            const units = await UnitMedicine.find({}).sort({ createdAt: -1 }).lean();
            return JSON.parse(JSON.stringify(units));
        },
        ['unitMedicine-data'],
        { tags: ['unitMedicine'] }
    );
    return cachedData();
}

export async function createUnitMedicineAction(_previousState, formData) {
    if (!formData || typeof formData.get !== 'function') {
        return { message: 'Dữ liệu không hợp lệ.', status: false };
    }

    await dbConnect();
    const name = formData.get('name');
    const note = formData.get('note') || '';

    const user = await checkAuthToken();
    if (!user || !user.id) {
        return { message: 'Bạn cần đăng nhập để thực hiện hành động này.', status: false };
    }
    if (!user.role.includes('Admin') && !user.role.includes('Sale') && !user.role.includes('Manager')) {
        return { message: 'Bạn không có quyền thực hiện chức năng này', status: false };
    }

    if (!name || !name.toString().trim()) {
        return { message: 'Tên đơn vị thuốc là bắt buộc.', status: false };
    }

    try {
        const unit = new UnitMedicine({
            name: name.toString().trim(),
            note: note.toString().trim(),
        });
        await unit.save();
        revalidateTag('unitMedicine');
        return { message: `Đã thêm đơn vị thuốc "${unit.name}" thành công.`, status: true };
    } catch (error) {
        if (error.code === 11000) {
            return { message: 'Tên đơn vị thuốc đã tồn tại.', status: false };
        }
        console.error("Lỗi thêm đơn vị thuốc:", error);
        return { message: 'Lỗi hệ thống, không thể thêm đơn vị thuốc.', status: false };
    }
}

export async function updateUnitMedicineAction(_previousState, formData) {
    if (!formData || typeof formData.get !== 'function') {
        return { message: 'Dữ liệu không hợp lệ.', status: false };
    }

    await dbConnect();
    const id = formData.get('id');
    const name = formData.get('name');
    const note = formData.get('note') || '';

    const user = await checkAuthToken();
    if (!user || !user.id) {
        return { message: 'Bạn cần đăng nhập để thực hiện hành động này.', status: false };
    }
    if (!user.role.includes('Admin') && !user.role.includes('Sale') && !user.role.includes('Manager')) {
        return { message: 'Bạn không có quyền thực hiện chức năng này', status: false };
    }

    if (!id) {
        return { message: 'ID đơn vị thuốc không hợp lệ.', status: false };
    }

    if (!name || !name.toString().trim()) {
        return { message: 'Tên đơn vị thuốc là bắt buộc.', status: false };
    }

    try {
        const unit = await UnitMedicine.findByIdAndUpdate(
            id,
            {
                name: name.toString().trim(),
                note: note.toString().trim(),
            },
            { new: true, runValidators: true }
        );

        if (!unit) {
            return { message: 'Không tìm thấy đơn vị thuốc để cập nhật.', status: false };
        }

        revalidateTag('unitMedicine');
        return { message: `Đã cập nhật đơn vị thuốc "${unit.name}" thành công.`, status: true };
    } catch (error) {
        if (error.code === 11000) {
            return { message: 'Tên đơn vị thuốc đã tồn tại.', status: false };
        }
        console.error("Lỗi cập nhật đơn vị thuốc:", error);
        return { message: 'Lỗi hệ thống, không thể cập nhật đơn vị thuốc.', status: false };
    }
}

export async function deleteUnitMedicineAction(_previousState, formData) {
    if (!formData || typeof formData.get !== 'function') {
        return { message: 'Dữ liệu không hợp lệ.', status: false };
    }

    await dbConnect();
    const id = formData.get('id');

    const user = await checkAuthToken();
    if (!user || !user.id) {
        return { message: 'Bạn cần đăng nhập để thực hiện hành động này.', status: false };
    }
    if (!user.role.includes('Admin') && !user.role.includes('Sale') && !user.role.includes('Manager')) {
        return { message: 'Bạn không có quyền thực hiện chức năng này', status: false };
    }

    if (!id) {
        return { message: 'ID đơn vị thuốc không hợp lệ.', status: false };
    }

    try {
        const deletedUnit = await UnitMedicine.findByIdAndDelete(id);
        if (!deletedUnit) {
            return { message: 'Không tìm thấy đơn vị thuốc để xóa.', status: false };
        }

        revalidateTag('unitMedicine');
        return { message: `Đã xóa thành công đơn vị thuốc "${deletedUnit.name}".`, status: true };
    } catch (error) {
        console.error("Lỗi xóa đơn vị thuốc:", error);
        return { message: 'Lỗi hệ thống, không thể xóa.', status: false };
    }
}

// ==================== TREATMENT DOCTOR ====================
export async function treatmentDoctor_data() {
    const cachedData = nextCache(
        async () => {
            await dbConnect();
            const doctors = await TreatmentDoctor.find({}).sort({ createdAt: -1 }).lean();
            return JSON.parse(JSON.stringify(doctors));
        },
        ['treatmentDoctor-data'],
        { tags: ['treatmentDoctor'] }
    );
    return cachedData();
}

export async function createTreatmentDoctorAction(_previousState, formData) {
    if (!formData || typeof formData.get !== 'function') {
        return { message: 'Dữ liệu không hợp lệ.', status: false };
    }

    await dbConnect();
    const name = formData.get('name');
    const expertise = formData.get('expertise') || '';
    const note = formData.get('note') || '';

    const user = await checkAuthToken();
    if (!user || !user.id) {
        return { message: 'Bạn cần đăng nhập để thực hiện hành động này.', status: false };
    }
    if (!user.role.includes('Admin') && !user.role.includes('Sale') && !user.role.includes('Manager')) {
        return { message: 'Bạn không có quyền thực hiện chức năng này', status: false };
    }

    if (!name || !name.toString().trim()) {
        return { message: 'Tên bác sĩ là bắt buộc.', status: false };
    }

    try {
        const doctor = new TreatmentDoctor({
            name: name.toString().trim(),
            expertise: expertise.toString().trim(),
            note: note.toString().trim(),
        });
        await doctor.save();
        revalidateTag('treatmentDoctor');
        return { message: `Đã thêm bác sĩ "${doctor.name}" thành công.`, status: true };
    } catch (error) {
        if (error.code === 11000) {
            return { message: 'Tên bác sĩ đã tồn tại.', status: false };
        }
        console.error("Lỗi thêm bác sĩ:", error);
        return { message: 'Lỗi hệ thống, không thể thêm bác sĩ.', status: false };
    }
}

export async function updateTreatmentDoctorAction(_previousState, formData) {
    if (!formData || typeof formData.get !== 'function') {
        return { message: 'Dữ liệu không hợp lệ.', status: false };
    }

    await dbConnect();
    const id = formData.get('id');
    const name = formData.get('name');
    const expertise = formData.get('expertise') || '';
    const note = formData.get('note') || '';

    const user = await checkAuthToken();
    if (!user || !user.id) {
        return { message: 'Bạn cần đăng nhập để thực hiện hành động này.', status: false };
    }
    if (!user.role.includes('Admin') && !user.role.includes('Sale') && !user.role.includes('Manager')) {
        return { message: 'Bạn không có quyền thực hiện chức năng này', status: false };
    }

    if (!id) {
        return { message: 'ID bác sĩ không hợp lệ.', status: false };
    }

    if (!name || !name.toString().trim()) {
        return { message: 'Tên bác sĩ là bắt buộc.', status: false };
    }

    try {
        const doctor = await TreatmentDoctor.findByIdAndUpdate(
            id,
            {
                name: name.toString().trim(),
                expertise: expertise.toString().trim(),
                note: note.toString().trim(),
            },
            { new: true, runValidators: true }
        );

        if (!doctor) {
            return { message: 'Không tìm thấy bác sĩ để cập nhật.', status: false };
        }

        revalidateTag('treatmentDoctor');
        return { message: `Đã cập nhật bác sĩ "${doctor.name}" thành công.`, status: true };
    } catch (error) {
        if (error.code === 11000) {
            return { message: 'Tên bác sĩ đã tồn tại.', status: false };
        }
        console.error("Lỗi cập nhật bác sĩ:", error);
        return { message: 'Lỗi hệ thống, không thể cập nhật bác sĩ.', status: false };
    }
}

export async function deleteTreatmentDoctorAction(_previousState, formData) {
    if (!formData || typeof formData.get !== 'function') {
        return { message: 'Dữ liệu không hợp lệ.', status: false };
    }

    await dbConnect();
    const id = formData.get('id');

    const user = await checkAuthToken();
    if (!user || !user.id) {
        return { message: 'Bạn cần đăng nhập để thực hiện hành động này.', status: false };
    }
    if (!user.role.includes('Admin') && !user.role.includes('Sale') && !user.role.includes('Manager')) {
        return { message: 'Bạn không có quyền thực hiện chức năng này', status: false };
    }

    if (!id) {
        return { message: 'ID bác sĩ không hợp lệ.', status: false };
    }

    try {
        const deletedDoctor = await TreatmentDoctor.findByIdAndDelete(id);
        if (!deletedDoctor) {
            return { message: 'Không tìm thấy bác sĩ để xóa.', status: false };
        }

        revalidateTag('treatmentDoctor');
        return { message: `Đã xóa thành công bác sĩ "${deletedDoctor.name}".`, status: true };
    } catch (error) {
        console.error("Lỗi xóa bác sĩ:", error);
        return { message: 'Lỗi hệ thống, không thể xóa.', status: false };
    }
}

