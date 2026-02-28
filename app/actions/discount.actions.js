'use server';

import dbConnect from "@/config/connectDB";
import DiscountProgram from "@/models/discountProgram.model";
import checkAuthToken from "@/utils/checktoken";
import { unstable_cache as nextCache, revalidateTag } from 'next/cache';

export async function discount_data() {
    const cachedData = nextCache(
        async () => {
            await dbConnect();
            const discounts = await DiscountProgram.find({}).sort({ createdAt: -1 }).lean();
            return JSON.parse(JSON.stringify(discounts));
        },
        ['discounts-data'],
        { tags: ['discounts'] }
    );
    return cachedData();
}

export async function createDiscountAction(_previousState, formData) {
    await dbConnect();
    const name = formData.get('name');
    const discount_value = formData.get('discount_value');
    const discount_unit = formData.get('discount_unit');
    const note = formData.get('note');

    const user = await checkAuthToken();
    if (!user || !user.id) {
        return { message: 'Bạn cần đăng nhập để thực hiện hành động này.', status: false };
    }
    if (!user.role.includes('Admin') && !user.role.includes('Sale') && !user.role.includes('Manager')) {
        return { message: 'Bạn không có quyền thực hiện chức năng này', status: false };
    }

    if (!name || !name.toString().trim()) {
        return { message: 'Tên chương trình khuyến mãi là bắt buộc.', status: false };
    }

    if (discount_value === null || discount_value === undefined || discount_value === '') {
        return { message: 'Giá trị giảm là bắt buộc.', status: false };
    }

    const numValue = Number(discount_value);
    if (isNaN(numValue) || numValue < 0) {
        return { message: 'Giá trị giảm phải là số >= 0.', status: false };
    }

    if (!discount_unit || !['none', 'amount', 'percent'].includes(discount_unit)) {
        return { message: 'Đơn vị giảm không hợp lệ.', status: false };
    }

    try {
        const existingDiscount = await DiscountProgram.findOne({ name: name.toString().trim() });
        if (existingDiscount) {
            return { message: 'Lỗi: Tên chương trình khuyến mãi này đã tồn tại.', status: false };
        }

        const newDiscount = new DiscountProgram({
            name: name.toString().trim(),
            discount_value: numValue,
            discount_unit: discount_unit,
            note: note?.toString().trim() || '',
        });

        await newDiscount.save();
        revalidateTag('discounts');
        return { message: `Đã tạo thành công chương trình khuyến mãi "${name}".`, status: true };
    } catch (error) {
        console.error("Lỗi tạo chương trình khuyến mãi:", error);
        return { message: 'Lỗi hệ thống, không thể tạo chương trình khuyến mãi.', status: false };
    }
}

export async function updateDiscountAction(_previousState, formData) {
    const id = formData.get('id');
    const name = formData.get('name');
    const discount_value = formData.get('discount_value');
    const discount_unit = formData.get('discount_unit');
    const note = formData.get('note');

    const user = await checkAuthToken();
    if (!user || !user.id) {
        return { message: 'Bạn cần đăng nhập để thực hiện hành động này.', status: false };
    }
    if (!user.role.includes('Admin') && !user.role.includes('Sale') && !user.role.includes('Manager')) {
        return { message: 'Bạn không có quyền thực hiện chức năng này', status: false };
    }

    if (!id || !name || !name.toString().trim()) {
        return { message: 'Dữ liệu không hợp lệ.', status: false };
    }

    if (discount_value === null || discount_value === undefined || discount_value === '') {
        return { message: 'Giá trị giảm là bắt buộc.', status: false };
    }

    const numValue = Number(discount_value);
    if (isNaN(numValue) || numValue < 0) {
        return { message: 'Giá trị giảm phải là số >= 0.', status: false };
    }

    if (!discount_unit || !['none', 'amount', 'percent'].includes(discount_unit)) {
        return { message: 'Đơn vị giảm không hợp lệ.', status: false };
    }

    try {
        await dbConnect();
        const existingDiscount = await DiscountProgram.findOne({ name: name.toString().trim(), _id: { $ne: id } });
        if (existingDiscount) {
            return { message: 'Lỗi: Tên chương trình khuyến mãi này đã được sử dụng.', status: false };
        }

        const updatedDiscount = await DiscountProgram.findByIdAndUpdate(
            id,
            {
                name: name.toString().trim(),
                discount_value: numValue,
                discount_unit: discount_unit,
                note: note?.toString().trim() || '',
            },
            { new: true }
        );

        if (!updatedDiscount) {
            return { message: 'Không tìm thấy chương trình khuyến mãi để cập nhật.', status: false };
        }

        revalidateTag('discounts');
        return { message: `Đã cập nhật thành công chương trình khuyến mãi "${name}".`, status: true };
    } catch (error) {
        console.error("Lỗi cập nhật chương trình khuyến mãi:", error);
        return { message: 'Lỗi hệ thống, không thể cập nhật.', status: false };
    }
}

export async function deleteDiscountAction(_previousState, formData) {
    if (!formData || typeof formData.get !== 'function') {
        return { message: 'Dữ liệu không hợp lệ.', status: false };
    }
    const id = formData.get('id');
    
    // Debug log
    console.log('🔍 [deleteDiscountAction] formData:', formData);
    console.log('🔍 [deleteDiscountAction] id:', id);

    const user = await checkAuthToken();
    if (!user || !user.id) {
        return { message: 'Bạn cần đăng nhập để thực hiện hành động này.', status: false };
    }
    if (!user.role.includes('Admin') && !user.role.includes('Sale') && !user.role.includes('Manager')) {
        return { message: 'Bạn không có quyền thực hiện chức năng này', status: false };
    }

    if (!id) {
        return { message: 'ID chương trình khuyến mãi không hợp lệ.', status: false };
    }

    try {
        await dbConnect();
        const deletedDiscount = await DiscountProgram.findByIdAndDelete(id);
        if (!deletedDiscount) {
            return { message: 'Không tìm thấy chương trình khuyến mãi để xóa.', status: false };
        }

        revalidateTag('discounts');
        return { message: 'Đã xóa thành công chương trình khuyến mãi.', status: true };
    } catch (error) {
        console.error("Lỗi xóa chương trình khuyến mãi:", error);
        return { message: 'Lỗi hệ thống, không thể xóa.', status: false };
    }
}

