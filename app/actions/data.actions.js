'use server';

import dbConnect from "@/config/connectDB";
import Form from "@/models/formclient";
import checkAuthToken from '@/utils/checktoken';
import { reloadForm } from '@/data/form_database/wraperdata.db.js'
import Customer from '@/models/customer';
import mongoose from 'mongoose';
export async function createAreaAction(_previousState, formData) {
    await dbConnect();
    const name = formData.get('name');
    const user = await checkAuthToken();

    if (!user || !user.id) return { message: 'Bạn cần đăng nhập để thực hiện hành động này.', status: false };
    if (!user.role.includes('Admin')) {
        return { message: 'Bạn không có quyền thực hiện chức năng này', status: false };
    }
    const formInputValues = formData.getAll('formInput');
    const formInput = formInputValues.map(Number);
    const describe = formData.get('describe');
    if (!name) return { message: 'Tên form là bắt buộc.', status: false };
    if (name.length > 50) return { message: 'Tên form phải ít hơn 50 kí tự', status: false };
    if (describe.length > 1000) return { message: 'Mô tả phải ít hơn 1000 kí tự', status: false };
    const processedName = name.toString().toLowerCase().trim();
    try {
        const existingArea = await Form.findOne({ name: processedName });
        if (existingArea) {
            return { message: 'Lỗi: Tên form này đã tồn tại.', status: false };
        }
        const newArea = new Form({
            name: processedName,
            describe: describe?.toString().trim(),
            createdBy: user.id,
            formInput: formInput,
        });
        await newArea.save();
        reloadForm();
        return { message: `Đã tạo thành công form "${name}".`, status: true };
    } catch (error) {
        console.error("Lỗi tạo form:", error);
        return { message: 'Lỗi hệ thống, không thể tạo form.', status: false };
    }
}

export async function updateAreaAction(_previousState, formData) {
    const id = formData.get('id');
    const name = formData.get('name');
    const describe = formData.get('describe');
    const formInputValues = formData.getAll('formInput');
    const formInput = formInputValues.map(Number);
    const user = await checkAuthToken();
    if (!user || !user.id) return { message: 'Bạn cần đăng nhập để thực hiện hành động này.', status: false };
    if (!user.role.includes('Admin')) {
        return { message: 'Bạn không có quyền thực hiện chức năng này', status: false };
    }
    if (!id || !name) {
        return { message: 'Dữ liệu không hợp lệ (thiếu ID hoặc tên).', status: false };
    }
    if (name.length > 50) {
        return { message: 'Tên form phải ít hơn 50 kí tự', status: false };
    }
    const processedName = name.toString().toLowerCase().trim();
    try {
        await dbConnect();
        const existingArea = await Form.findOne({
            name: processedName,
            _id: { $ne: id }
        });

        if (existingArea) {
            return { message: 'Lỗi: Tên form này đã được sử dụng ở một khu vực khác.', status: false };
        }

        const updatedArea = await Form.findByIdAndUpdate(
            id,
            {
                name: processedName,
                describe: describe?.toString().trim(),
                formInput: formInput,
            },
            { new: true }
        );

        if (!updatedArea) {
            return { message: 'Không tìm thấy khu vực để cập nhật.', status: false };
        }
        reloadForm();
        return { message: `Đã cập nhật thành công form "${name}".`, status: true };

    } catch (error) {
        console.error("Lỗi cập nhật form:", error);
        return { message: 'Lỗi hệ thống, không thể cập nhật form.', status: false };
    }
}

export async function deleteAreaAction(_previousState, formData) {
    const id = formData.get('id');
    const user = await checkAuthToken();
    if (!user || !user.id) return { message: 'Bạn cần đăng nhập để thực hiện hành động này.', status: false };
    if (!user.role.includes('Admin') && !user.role.includes('Sale')) {
        return { message: 'Bạn không có quyền thực hiện chức năng này', status: false };
    }
    try {
        await dbConnect();
        const areaToDelete = await Form.findById(id);
        if (!areaToDelete) { return { status: false, message: 'Không tìm thấy khu vực để xóa.' }; }
        await Form.findByIdAndDelete(id);
        reloadForm();
        return { status: true, message: 'Xóa khu vực thành công!' };
    } catch (error) {
        console.error('Lỗi khi xóa khu vực:', error);
        return { status: false, message: 'Đã xảy ra lỗi. Không thể xóa khu vực.' };
    }
}
import { revalidateData } from '@/app/actions/customer.actions';
const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbxvb6bM9l3Yw0n3QJILbNA4BMynBcuGdQYvXKuxNLWU1fhjoFS54OjZ2qbis3vJEm-QYg/exec';


export async function addRegistrationToAction(_previousState, formData) {
    // --- BƯỚC 1: LẤY DỮ LIỆU VÀ SANITIZE ---
    // Sử dụng trim() để loại bỏ khoảng trắng thừa, tránh injection cơ bản
    const rawFormData = {
        name: formData.get('name')?.trim() || '',
        address: formData.get('address')?.trim() || '',
        phone: formData.get('phone')?.trim() || '',
        email: formData.get('email')?.trim() || '',
        bd: formData.get('bd')?.trim() || '',
        service: formData.get('service')?.trim() || '',
        source: formData.get('source')?.trim() || '',
        sourceName: formData.get('sourceName')?.trim() || '',
    };

    // --- BƯỚC 2: VALIDATE DỮ LIỆU ---
    // Name: Bắt buộc theo model
    if (!rawFormData.name) {
        return { message: 'Vui lòng nhập họ và tên.', type: 'error' };
    }

    // Phone: Bắt buộc, normalize, regex strict (Việt Nam: 10 chữ số, bắt đầu bằng 0)
    if (!rawFormData.phone) {
        return { message: 'Vui lòng nhập số điện thoại.', type: 'error' };
    }
    rawFormData.phone = normalizePhone(rawFormData.phone);
    const phoneRegex = /^0\d{9}$/;
    if (!phoneRegex.test(rawFormData.phone)) {
        return { message: 'Số điện thoại không hợp lệ (phải là 10 chữ số, bắt đầu bằng 0).', type: 'error' };
    }

    // Email: Nếu có, check format cơ bản
    if (rawFormData.email) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(rawFormData.email)) {
            return { message: 'Email không hợp lệ.', type: 'error' };
        }
    }

    // Birthdate: Nếu có, validate và convert sang Date
    let birthDate = null;
    if (rawFormData.bd) {
        birthDate = new Date(rawFormData.bd);
        if (isNaN(birthDate.getTime())) {
            return { message: 'Ngày sinh không hợp lệ.', type: 'error' };
        }
    }

    // Source: Phải là ObjectId hợp lệ
    if (!rawFormData.source || !mongoose.Types.ObjectId.isValid(rawFormData.source)) {
        return { message: 'Nguồn dữ liệu không hợp lệ.', type: 'error' };
    }

    // Check missing info cho trạng thái
    let initialStatus = 'new_unconfirmed';
    if (!rawFormData.name || !rawFormData.phone || !rawFormData.service) {
        initialStatus = 'missing_info';
    }

    await dbConnect();
    const existingCustomer = await Customer.findOne({ phone: rawFormData.phone });
    if (existingCustomer) {
        // Merge nếu trùng (PDF: Data trùng – Gộp hồ sơ)
        existingCustomer.tags = [...new Set([...existingCustomer.tags, rawFormData.service])]; // Merge tags
        existingCustomer.care.push({ content: 'Data trùng từ form mới, gộp hồ sơ', createBy: '68b0af5cf58b8340827174e0' });
        await existingCustomer.save();
        return { message: 'Data trùng, đã gộp hồ sơ.', type: 'success' };
    }

    // --- BƯỚC 3: TẠO CUSTOMER TRONG MONGODB ---
    try {
        const newCustomer = new Customer({
            name: rawFormData.name,
            bd: birthDate,
            email: rawFormData.email,
            phone: rawFormData.phone,
            area: rawFormData.address,
            source: rawFormData.source,
            sourceDetails: rawFormData.sourceName, // Map
            tags: [rawFormData.service], // Push dịch vụ vào tags
            pipelineStatus: initialStatus,
            care: [{ content: `Tiếp nhận từ ${rawFormData.sourceName || 'form'}, nguồn: ${rawFormData.source}`, createBy: '68b0af5cf58b8340827174e0' }], // Log tự động
        });

        await newCustomer.save();
        revalidateData();

        // --- BƯỚC 4: CHUẨN BỊ VÀ GỬI THÔNG BÁO QUA APPS SCRIPT ---
        const createAt = new Date();
        const formattedCreateAt = createAt.toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
        const formattedBirthDate = birthDate ? birthDate.toLocaleDateString('vi-VN') : 'Không có';

        const messageForAppScript = `📅 Đăng ký từ Form ${rawFormData.sourceName || 'Form trực tiếp'}
-----------------------------------
Họ và tên: ${rawFormData.name}
Liên hệ: ${rawFormData.phone}
Địa chỉ: ${rawFormData.address || 'Không có'}
Ngày sinh: ${formattedBirthDate}
Dịch vụ quan tâm: ${rawFormData.service || 'Không có'}
Thời gian: ${formattedCreateAt}`;

        const encodedMessage = encodeURIComponent(messageForAppScript);
        const url = `${APPS_SCRIPT_URL}?mes=${encodedMessage}`;
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`Apps Script request failed with status ${response.status}`);
        }

        return { message: 'Đăng ký thành công! Chúng tôi sẽ liên hệ với bạn sớm nhất.', type: 'success' };

    } catch (error) {
        console.error("Lỗi khi xử lý đăng ký:", error);
        if (error.code === 11000 && error.keyPattern?.phone) {
            return { message: 'Số điện thoại này đã được đăng ký trước đó.', type: 'error' };
        }
        return { message: 'Lỗi hệ thống, không thể gửi đăng ký. Vui lòng thử lại sau.', type: 'error' };
    }
}

function normalizePhone(phone) {
    const t = (phone ?? '').trim().replace(/\D/g, ''); // Chỉ giữ số, tránh injection
    if (!t) return '';
    return t.startsWith('0') ? t : '0' + t;
}