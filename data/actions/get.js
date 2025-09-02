'use server'

import { getAreaOne, getAreaAll } from '@/data/database/area'
import { getUserAll, getUserOne } from '@/data/database/user'
import { getLabelAll } from '../database/label'
import { getFormAll } from '../database/form'
import { getZaloAll, getZaloOne } from '../database/zalo'
import Logs from '@/models/log.model'
import Customer from '@/models/customer.model'
import Zalo from '@/models/zalo.model'
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
    try {
        await connectDB();
        const filter = {};
        if (id && type) {
            if (type === 'student') {
                filter.student = id;
            } else {
                filter.customer = id;
            }
        } else if (id || type) {
            // Nếu chỉ có 1 trong 2, trả về lỗi hoặc mảng rỗng
            return { success: false, error: "Thiếu ID hoặc loại đối tượng." };
        }
        // Nếu không có id và type, sẽ lấy tất cả logs

        // Lấy thông tin giới hạn Zalo
        const zaloAccounts = await Zalo.find({}).lean();
        const zaloLimits = {
            hourly: zaloAccounts.reduce((sum, account) => sum + (account.rateLimit?.hourly || account.rateLimitPerHour || 0), 0),
            daily: zaloAccounts.reduce((sum, account) => sum + (account.rateLimit?.daily || account.rateLimitPerDay || 0), 0)
        };

        // Lấy toàn bộ lịch sử log
        const history = await Logs.find(filter)
            .populate('zalo', 'name avt')
            .populate('createBy', 'name')
            .sort({ createdAt: -1 })
            .lean();
            
        const plainHistory = JSON.parse(JSON.stringify(history));
        
        return { 
            success: true, 
            data: plainHistory,
            zaloLimits 
        };
    } catch (err) {
        console.error("Error getting history:", err);
        return { success: false, error: "Lỗi máy chủ khi lấy lịch sử." };
    }
}

export async function customer_data_all() {
    try {
        await connectDB();
        const customers = await Customer.find({}).lean();
        return JSON.parse(JSON.stringify(customers));
    } catch (err) {
        console.error("Error getting all customers:", err);
        return [];
    }
}