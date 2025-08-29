'use server'

import { getAreaOne, getAreaAll } from '@/data/database/area'
import { getUserAll, getUserOne } from '@/data/database/user'
import { getLabelAll } from '../database/label'
import { getFormAll } from '../database/form'
import { getZaloAll, getZaloOne } from '../database/zalo'
import Logs from '@/models/log'
import '@/models/zalo'
import connectDB from '@/config/connectDB'

export async function area_data(_id) {
    let data = _id ? await getAreaOne(_id) : await getAreaAll()
    return _id && data ? data[0] || null : data || null
}

// Lấy tài khoản zalo
export async function zalo_data(_id) {
    let data = _id ? await getZaloOne(_id) : await getZaloAll()
    return data || null
}
// lấy thông tin user
export async function user_data({ _id = null }) {
    console.log(_id);

    if (_id) {
        return await getUserOne(_id)
    } else {
        return await getUserAll()
    }
}
// lấy nhãn
export async function label_data() {
    return await getLabelAll()
}
// lấy nguồn
export async function form_data() {
    return await getFormAll()
}
// Lịch sử chăm sóc
export async function history_data(id, type) {
    if (!id || !type) {
        return { success: false, error: "Thiếu ID hoặc loại đối tượng." };
    }

    try {
        await connectDB();
        const filter = {};
        if (type === 'student') {
            filter.student = id;
        } else { filter.customer = id; }
        const history = await Logs.find(filter).populate('zalo', 'name avt').populate('createBy', 'name').sort({ createdAt: -1 }).lean();
        const plainHistory = JSON.parse(JSON.stringify(history));
        return { success: true, data: plainHistory };
    } catch (err) {
        console.error("Error getting customer history:", err);
        return { success: false, error: "Lỗi máy chủ khi lấy lịch sử chăm sóc." };
    }
}