// data/db/appointment.db.js

import Appointment from '@/models/appointment.model'
import connectDB from '@/config/connectDB'
import { cacheData } from '@/lib/cache'
import mongoose from 'mongoose'

/**
 * Hàm gốc để truy vấn dữ liệu lịch hẹn, chưa có cache.
 * @param {object} params - Các tham số truy vấn.
 * @param {string} [params.customerId] - ID của khách hàng để lấy lịch hẹn.
 * @param {string} [params.createdBy] - ID của người tạo lịch hẹn.
 * @param {string} [params.status] - Trạng thái lịch hẹn cần lọc.
 * @param {object} [params.dateRange] - Khoảng thời gian để lọc lịch hẹn.
 * @param {Date} [params.dateRange.start] - Ngày bắt đầu khoảng thời gian.
 * @param {Date} [params.dateRange.end] - Ngày kết thúc khoảng thời gian.
 * @param {number} [params.year] - Năm để lấy lịch hẹn.
 * @param {number} [params.month] - Tháng để lấy lịch hẹn.
 * @returns {Promise<Array|object>}
 */
export async function dataAppointment(params = {}) {
    try {
        await connectDB()
        const matchStage = {};

        // Lọc theo ID khách hàng
        if (params.customerId) {
            matchStage.customer = new mongoose.Types.ObjectId(params.customerId);
        }

        // Lọc theo người tạo
        if (params.createdBy) {
            matchStage.createdBy = new mongoose.Types.ObjectId(params.createdBy);
        }

        // Lọc theo trạng thái
        if (params.status) {
            matchStage.status = params.status;
        }

        // Lọc theo khoảng thời gian
        if (params.dateRange && params.dateRange.start && params.dateRange.end) {
            matchStage.appointmentDate = {
                $gte: new Date(params.dateRange.start),
                $lte: new Date(params.dateRange.end)
            };
        }
        // Nếu không có dateRange nhưng có year và month, lọc theo tháng cụ thể
        else if (params.year && params.month) {
            // Tháng trong JS bắt đầu từ 0 (tháng 1 là 0)
            const monthIndex = params.month - 1;
            const startDate = new Date(params.year, monthIndex, 1);
            // Lấy ngày cuối cùng của tháng bằng cách lấy ngày 0 của tháng tiếp theo
            const endDate = new Date(params.year, monthIndex + 1, 0, 23, 59, 59);

            matchStage.appointmentDate = {
                $gte: startDate,
                $lte: endDate,
            };
        }

        // Pipeline để lấy dữ liệu và populate thông tin liên quan
        const aggregationPipeline = [
            { $match: matchStage },
            { $sort: { appointmentDate: -1 } }, // Sắp xếp theo ngày hẹn gần nhất
            {
                $lookup: {
                    from: 'customers', // Tên collection của Customer model
                    localField: 'customer',
                    foreignField: '_id',
                    as: 'customerInfo'
                }
            },
            {
                $lookup: {
                    from: 'users', // Tên collection của User model
                    localField: 'createdBy',
                    foreignField: '_id',
                    as: 'creatorInfo'
                }
            },
            { // Sử dụng $unwind để chuyển array thành object (giống populate)
                $unwind: { path: "$customerInfo", preserveNullAndEmptyArrays: true }
            },
            {
                $unwind: { path: "$creatorInfo", preserveNullAndEmptyArrays: true }
            },
            { // Chọn lọc và đổi tên field cho gọn
                $project: {
                    title: 1,
                    appointmentDate: 1,
                    notes: 1,
                    status: 1,
                    createdAt: 1,
                    customer: { _id: "$customerInfo._id", name: "$customerInfo.name", phone: "$customerInfo.phone" },
                    createdBy: { _id: "$creatorInfo._id", name: "$creatorInfo.name", group: "$creatorInfo.group" }
                }
            }
        ];

        const appointments = await Appointment.aggregate(aggregationPipeline);

        return JSON.parse(JSON.stringify(appointments));
    } catch (error) {
        console.error('Lỗi trong dataAppointment:', error);
        throw new Error('Không thể lấy dữ liệu lịch hẹn.');
    }
}


export async function dataAppointments() {
    try {
        await connectDB()
        let appointments = await Appointment.find({})
        return JSON.parse(JSON.stringify(appointments));
    } catch (error) {
        console.error('Lỗi trong dataAppointment:', error);
        throw new Error('Không thể lấy dữ liệu lịch hẹn.');
    }
}


/**
 * Lấy danh sách lịch hẹn của một khách hàng (có cache).
 * @param {string} customerId - ID của khách hàng
 * @returns {Promise<Array>}
 */
export async function getAppointmentsByCustomer(customerId) {
    try {
        // Tag cache là 'appointments' và key bao gồm cả customerId để đảm bảo tính duy nhất
        const cachedFunction = cacheData(
            () => dataAppointment({ customerId }),
            ['appointments', customerId]
        );
        return await cachedFunction();
    } catch (error) {
        console.error('Lỗi trong getAppointmentsByCustomer:', error);
        throw new Error('Không thể lấy dữ liệu lịch hẹn theo khách hàng.');
    }
}

/**
 * Lấy danh sách tất cả lịch hẹn trong một tháng cụ thể (có cache).
 * @param {number} year - Năm
 * @param {number} month - Tháng (1-12)
 * @returns {Promise<Array>}
 */
export async function getAppointmentsByMonth(year, month) {
    try {
        // Tag cache là 'appointments' và key bao gồm cả năm và tháng
        const cacheKey = `${year}-${month}`;
        const cachedFunction = cacheData(
            () => dataAppointment({ year, month }),
            ['appointments', cacheKey]
        );
        return await cachedFunction();
    } catch (error) {
        console.error('Lỗi trong getAppointmentsByMonth:', error);
        throw new Error('Không thể lấy dữ liệu lịch hẹn theo tháng.');
    }
}