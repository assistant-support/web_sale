'use server';

import { getServiceAll, getServiceOne } from '@/data/services/handledata.db';
import Service from '@/models/services.model';
import connectDB from '@/config/connectDB';
import { revalidateTag } from 'next/cache';
import checkAuthToken from '@/utils/checktoken';

export async function service_data(id) {
  if (id) {
    return await getServiceOne(id);
  }
  return await getServiceAll();
}

export async function reloadServices() {
  revalidateTag('services');
}

export async function createService(formData) {
  try {
    const user = await checkAuthToken();
    if (!user || !user.role.includes('Admin')) {
      return { success: false, error: 'Bạn không có quyền thực hiện hành động này.' };
    }
    await connectDB();
    const {
      name,
      type,
      description,
      fees
    } = formData;
    console.log('Creating service with data:', formData);

    const parsedFees = JSON.parse(fees || '[]');
    const totalPrice = parsedFees.reduce((sum, fee) => sum + fee.amount, 0);

    const newService = new Service({
      name,
      type,
      description,
      price: totalPrice, // Tính tổng từ fees
      fees: parsedFees
    });
    await newService.save();
    revalidateTag('services');
    return { success: true };
  } catch (error) {
    console.error('Lỗi tạo dịch vụ:', error);
    return { success: false, error: 'Không thể tạo dịch vụ.' };
  }
}

export async function updateService(id, formData) {
  try {
    const user = await checkAuthToken();
    if (!user || !user.role.includes('Admin')) {
      return { success: false, error: 'Bạn không có quyền thực hiện hành động này.' };
    }
    await connectDB();
    const {
      name,
      type,
      description,
      fees // Chỉ cập nhật fees, tính tổng price mới
    } = formData;
    const service = await Service.findById(id);
    if (!service) throw new Error('Dịch vụ không tồn tại.');

    const parsedFees = JSON.parse(fees || '[]');
    const totalPrice = parsedFees.reduce((sum, fee) => sum + fee.amount, 0);

    service.name = name;
    service.type = type;
    service.description = description;
    service.price = totalPrice; // Cập nhật tổng từ fees mới
    service.fees = parsedFees;

    await service.save();
    revalidateTag('services');
    return { success: true };
  } catch (error) {
    console.error('Lỗi cập nhật dịch vụ:', error);
    return { success: false, error: 'Không thể cập nhật dịch vụ.' };
  }
}

export async function deleteService(id) {
  try {
    const user = await checkAuthToken();
    if (!user || !user.role.includes('Admin')) {
      return { success: false, error: 'Bạn không có quyền thực hiện hành động này.' };
    }
    await connectDB();
    const service = await Service.findById(id);
    if (!service) throw new Error('Dịch vụ không tồn tại.');
    // Kiểm tra nếu đang sử dụng (ví dụ: lookup leadCount > 0 thì không xóa)
    if (service.leadCount > 0) {
      return { success: false, error: 'Dịch vụ đang được sử dụng, không thể xóa.' };
    }
    await Service.deleteOne({ _id: id });
    revalidateTag('services');
    return { success: true };
  } catch (error) {
    console.error('Lỗi xóa dịch vụ:', error);
    return { success: false, error: 'Không thể xóa dịch vụ.' };
  }
}