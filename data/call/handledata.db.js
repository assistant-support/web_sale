// data/calls/handledata.db.js
import connectDB from '@/config/connectDB';
import { cacheData } from '@/lib/cache';
import Call from '@/models/call.model';
import '@/models/customer.model';
import '@/models/users';

/**
 * HÀM GỐC (KHÔNG EXPORT): Lấy tất cả cuộc gọi (chưa cache)
 */
async function dataCallsAll() {
    try {
        await connectDB();

        const calls = await Call.find({})
            .populate({
                path: 'customer',
                select: 'name phone email zaloname' // chọn các field cần để hiển thị
            })
            .populate({
                path: 'user',
                select: 'name email' // chọn các field cần để hiển thị
            })
            .sort({ createdAt: -1 })
            .lean();

        return JSON.parse(JSON.stringify(calls));
    } catch (error) {
        console.error('Lỗi trong dataCallsAll:', error);
        throw new Error('Không thể lấy danh sách cuộc gọi.');
    }
}

/**
 * HÀM GỐC (KHÔNG EXPORT): Lấy cuộc gọi theo customer (chưa cache)
 * @param {string} customerId
 */
async function dataCallsByCustomer(customerId) {
    try {
        await connectDB();

        const calls = await Call.find({ customer: customerId })
            .populate({
                path: 'customer',
                select: 'name phone email zaloname'
            })
            .populate({
                path: 'user',
                select: 'name email'
            })
            .sort({ createdAt: -1 })
            .lean();

        return JSON.parse(JSON.stringify(calls));
    } catch (error) {
        console.error('Lỗi trong dataCallsByCustomer:', error);
        throw new Error('Không thể lấy cuộc gọi theo khách hàng.');
    }
}

/**
 * LẤY TẤT CẢ CUỘC GỌI (ĐÃ CACHE)
 */
export async function getCallsAll() {
    try {
        const cached = cacheData(() => dataCallsAll(), ['calls']);
        return await cached();
    } catch (error) {
        console.error('Lỗi trong getCallsAll:', error);
        throw new Error('Không thể lấy danh sách tất cả cuộc gọi.');
    }
}

/**
 * LẤY CUỘC GỌI THEO CUSTOMER (ĐÃ CACHE)
 * @param {string} customerId
 */
export async function getCallsByCustomer(customerId) {
    if (!customerId) throw new Error('Thiếu customerId.');
    try {
        const cached = cacheData(() => dataCallsByCustomer(customerId), ['calls', `calls:${customerId}`]);
        return await cached();
    } catch (error) {
        console.error('Lỗi trong getCallsByCustomer:', error);
        throw new Error('Không thể lấy cuộc gọi theo khách hàng.');
    }
}
