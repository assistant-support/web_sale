'use server'

import { getAreaOne, getAreaAll } from '@/data/database/area'
import { getAreaCustomerAll, getAreaCustomerOne } from '@/data/database/area_customer'
import { getUserAll, getUserOne } from '@/data/database/user'
import { getLabelAll } from '../database/label'
import { getFormAll } from '../database/form'
import { getZaloAll, getZaloOne, getZaloAllNoCache, getZaloOneNoCache } from '../database/zalo'
import { getFilterCustomerAll } from '@/data/database/filter_customer'
import Logs from '@/models/log.model'
import Customer from '@/models/customer.model'
import Zalo from '@/models/zalo.model'
import connectDB from '@/config/connectDB'
import mongoose from "mongoose";

export async function area_data(_id) {
    let data = _id ? await getAreaOne(_id) : await getAreaAll()
    return _id && data ? data[0] || null : data || null
}

// Lấy dữ liệu khu vực khách hàng
export async function area_customer_data(_id) {
    try {
        // console.log('🔄 [area_customer_data] Bắt đầu lấy dữ liệu, _id:', _id)
        let data = _id ? await getAreaCustomerOne(_id) : await getAreaCustomerAll()
        // console.log('📦 [area_customer_data] Dữ liệu nhận được:', {
        //     type: typeof data,
        //     isArray: Array.isArray(data),
        //     data: data,
        //     length: data?.length
        // })
        const result = _id && data ? data[0] || null : data || null
        // console.log('✅ [area_customer_data] Kết quả trả về:', result)
        return result
    } catch (error) {
        console.error('❌ [area_customer_data] Lỗi:', error)
        return null
    }
}

// Lấy dữ liệu filter customer (tháng sinh)
export async function filter_customer_data() {
    try {
        const data = await getFilterCustomerAll()
        // console.log('🔄 [filter_customer_data] Dữ liệu nhận được từ getFilterCustomerAll:', {
        //     type: typeof data,
        //     isArray: Array.isArray(data),
        //     length: data?.length,
        //     sample: data?.[0]
        // })
        
        // Merge tất cả documents lại thành 1 object chứa tất cả các tháng
        // Vì có thể có nhiều documents, mỗi document chứa các tháng khác nhau
        const merged = {
            month1: [],
            month2: [],
            month3: [],
            month4: [],
            month5: [],
            month6: [],
            month7: [],
            month8: [],
            month9: [],
            month10: [],
            month11: [],
            month12: []
        }
        
        if (Array.isArray(data) && data.length > 0) {
            data.forEach((doc, docIndex) => {
                // console.log(`📄 [filter_customer_data] Processing document ${docIndex}:`, doc)
                for (let i = 1; i <= 12; i++) {
                    const monthKey = `month${i}`
                    if (doc[monthKey] && Array.isArray(doc[monthKey])) {
                        // console.log(`  📊 [filter_customer_data] ${monthKey} có ${doc[monthKey].length} items`)
                        // Merge arrays và loại bỏ trùng lặp
                        const existingIds = new Set(merged[monthKey].map(id => String(id)))
                        doc[monthKey].forEach(id => {
                            const idStr = String(id)
                            if (idStr && idStr !== 'null' && idStr !== 'undefined' && !existingIds.has(idStr)) {
                                merged[monthKey].push(id)
                                existingIds.add(idStr)
                            }
                        })
                        // console.log(`  ✅ [filter_customer_data] ${monthKey} sau merge: ${merged[monthKey].length} items`)
                    }
                }
            })
        }
        
        // console.log('✅ [filter_customer_data] Kết quả merge:', {
        //     month1: merged.month1.length,
        //     month2: merged.month2.length,
        //     month3: merged.month3.length,
        //     month4: merged.month4.length,
        //     month5: merged.month5.length,
        //     month6: merged.month6.length,
        //     month7: merged.month7.length,
        //     month8: merged.month8.length,
        //     month9: merged.month9.length,
        //     month10: merged.month10.length,
        //     month11: merged.month11.length,
        //     month12: merged.month12.length
        // })
        
        return merged
    } catch (error) {
        console.error('❌ [filter_customer_data] Lỗi:', error)
        return {
            month1: [], month2: [], month3: [], month4: [],
            month5: [], month6: [], month7: [], month8: [],
            month9: [], month10: [], month11: [], month12: []
        }
    }
}

// Lấy tài khoản zalo
export async function zalo_data(_id) {
    let data = _id ? await getZaloOneNoCache(_id) : await getZaloAllNoCache()
    return data || null
}
// lấy thông tin user
export async function user_data({ _id = null }) {
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

        // Tạo filter
        const filter = {};

        // Nếu có id thì lọc theo customer
        if (id) {
            if (!mongoose.isValidObjectId(id)) {
                return { success: false, error: "customer id không hợp lệ." };
            }
            filter.customer = new mongoose.Types.ObjectId(id);
        }

        // Nếu có type thì lọc thêm
        if (type) {
            filter.type = type;
        }

        // Tính hạn mức từ tất cả tài khoản Zalo
        const zaloAccounts = await Zalo.find({}).lean();
        const zaloLimits = {
            hourly: zaloAccounts.reduce(
                (sum, acc) => sum + (acc.rateLimit?.hourly ?? acc.rateLimitPerHour ?? 0),
                0
            ),
            daily: zaloAccounts.reduce(
                (sum, acc) => sum + (acc.rateLimit?.daily ?? acc.rateLimitPerDay ?? 0),
                0
            ),
        };
        // Lấy lịch sử log theo filter
        const history = await Logs.find(filter)
            .populate("zalo", "name avt")
            .populate("createBy", "name")
            .populate('customer', 'name')
            .sort({ createdAt: -1 })
            .lean();
        const plainHistory = JSON.parse(JSON.stringify(history));

        return {
            success: true,
            data: plainHistory,
            zaloLimits,
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