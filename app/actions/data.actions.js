'use server';

import { google } from 'googleapis';
import dbConnect from "@/config/connectDB";
import Form from "@/models/formclient";
import { getCurrentUser } from '@/lib/session';
import { reloadForm } from '@/data/form_database/wraperdata.db.js'
import getSheets from '@/function/drive/connect'
import Customer from '@/models/customer';

export async function createAreaAction(_previousState, formData) {
    console.log('hi');

    await dbConnect();
    const name = formData.get('name');
    const user = await getCurrentUser();
    console.log(user);

    if (!user || !user._id) return { message: 'Bạn cần đăng nhập để thực hiện hành động này.', status: false };
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
            createdBy: user._id,
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
    const user = await getCurrentUser();
    if (!user || !user._id) return { message: 'Bạn cần đăng nhập để thực hiện hành động này.', status: false };
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
    const user = await getCurrentUser();
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

// =================================================================
// 2. CẤU HÌNH & KẾT NỐI DỊCH VỤ GOOGLE
// =================================================================
const SPREADSHEET_ID = '1QOHqG1wvV-oDoPAxSDw37hfP0AHctPYpHxyJlHenZJY';
const RANGE_DATA = 'Data';
const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbxvb6bM9l3Yw0n3QJILbNA4BMynBcuGdQYvXKuxNLWU1fhjoFS54OjZ2qbis3vJEm-QYg/exec';

export async function addRegistrationToAction(_previousState, formData) {
    // --- BƯỚC 1: LẤY DỮ LIỆU, CHỈ CÓ PHONE LÀ BẮT BUỘC ---
    const rawFormData = {
        name: formData.get('name')?.trim(),
        nameparent: formData.get('nameparent')?.trim(),
        phone: formData.get('phone')?.trim(),
        email: formData.get('email')?.trim(),
        bd: formData.get('bd'),
        area: formData.get('area')?.trim(),
        source: formData.get('source')?.trim(),
        sourceName: formData.get('sourceName')?.trim(),
    };

    // --- BƯỚC 2: VALIDATE DỮ LIỆU ---

    // Chỉ có SĐT là bắt buộc và phải đúng định dạng
    if (!rawFormData.phone) {
        return { message: 'Vui lòng nhập số điện thoại.', type: 'error' };
    }
    rawFormData.phone = normalizePhone(rawFormData.phone);

    await dbConnect();
    const g = await Customer.findOne({ phone: rawFormData.phone });
    if (g) return { message: 'Số điện thoại đã được đăng ký.', type: 'error' };
    const phoneRegex = /^0\d{9}$/;
    if (!phoneRegex.test(rawFormData.phone)) {
        return { message: 'Số điện thoại không hợp lệ. Vui lòng kiểm tra lại.', type: 'error' };
    }

    // THAY ĐỔI: Chỉ xử lý và validate ngày sinh nếu nó được cung cấp
    let formattedBirthDate = ''; // Mặc định là chuỗi rỗng
    if (rawFormData.bd) {
        const birthDate = new Date(rawFormData.bd);
        if (isNaN(birthDate.getTime())) {
            // Nếu ngày sinh được nhập nhưng không hợp lệ -> báo lỗi
            return { message: 'Ngày sinh không hợp lệ.', type: 'error' };
        }
        formattedBirthDate = birthDate.toLocaleDateString('vi-VN');
    }

    // --- BƯỚC 3: CHUẨN BỊ DỮ LIỆU ĐỂ GỬI ĐI ---
    const createAt = new Date();
    const formattedCreateAt = createAt.toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });

    // THAY ĐỔI: Thêm `|| ''` để đảm bảo không có giá trị "undefined" trong tin nhắn
    const messageForAppScript = `📅 Đăng ký từ Form ${rawFormData.sourceName || 'Form trực tiếp'}
-----------------------------------
Họ và Tên PH: ${rawFormData.nameparent || 'Không có'}
Liên hệ: ${rawFormData.phone}
Tên HS: ${rawFormData.name || 'Không có'}
Ngày sinh: ${formattedBirthDate || 'Không có'}
Khu vực: ${rawFormData.area || 'Không có'}
Thời gian: ${formattedCreateAt}`;

    // THAY ĐỔI: Giữ nguyên cấu trúc cột cho Google Sheet.
    // Dùng `|| ''` để điền vào các ô trống nếu dữ liệu không có.
    const newRowForSheet = [
        rawFormData.nameparent || '', // Cột 1: Tên PH
        rawFormData.phone,            // Cột 2: SĐT (luôn có)
        rawFormData.name || '',       // Cột 3: Tên HS
        rawFormData.email || '',      // Cột 4: Email
        formattedBirthDate,           // Cột 5: Ngày sinh (đã xử lý ở trên)
        rawFormData.area || '',       // Cột 6: Khu vực
        rawFormData.source || '',     // Cột 7: Nguồn
        formattedCreateAt,            // Cột 8: Thời gian (luôn có)
    ];

    // --- BƯỚC 4: THỰC THI GỬI DỮ LIỆU ---
    try {
        await Promise.all([
            // Gửi tới Google Sheets
            (async () => {
                const sheets = await getSheets();
                await sheets.spreadsheets.values.append({
                    spreadsheetId: SPREADSHEET_ID,
                    range: RANGE_DATA,
                    valueInputOption: 'USER_ENTERED',
                    insertDataOption: 'INSERT_ROWS',
                    requestBody: { values: [newRowForSheet] },
                });
            })(),
            // Gửi thông báo qua Apps Script
            (async () => {
                const encodedMessage = encodeURIComponent(messageForAppScript);
                const url = `${APPS_SCRIPT_URL}?mes=${encodedMessage}`;
                const response = await fetch(url);
                if (!response.ok) {
                    throw new Error(`Apps Script request failed with status ${response.status}`);
                }
            })(),
        ]);

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
    const t = (phone ?? '').trim();
    if (!t) return t;
    return t.startsWith('0') ? t : '0' + t;
}