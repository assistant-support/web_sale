import Customer from '@/models/customer.model'
import connectDB from '@/config/connectDB'
import { cacheData } from '@/lib/cache'
import '@/models/formclient'

/**
 * Hàm gốc để truy vấn một phần dữ liệu khách hàng (chưa có cache).
 * CHỈ lấy một số lượng giới hạn để cache (mặc định 100 customers mới nhất).
 * KHÔNG cache care (logs/timeline) vì có thể rất lớn (>2MB).
 * Chỉ lấy 5 care logs mới nhất để hiển thị preview.
 * KHÔNG export ra ngoài.
 * 
 * @param {Object} options - Tùy chọn
 * @param {number} options.limit - Số lượng customers cần lấy (mặc định 100)
 */
async function dataCustomer(options = {}) {
    try {
        const { limit = 100 } = options;
        await connectDB();

        // CHỈ lấy một số lượng giới hạn customers mới nhất
        const customers = await Customer.find({})
            .populate({ path: 'source', select: 'name' })
            .populate({ path: 'roles', select: 'name avt' })
            // ==== Populate đầy đủ các tham chiếu trong serviceDetails (mảng) ====
            .populate([
                { path: 'serviceDetails.selectedService', select: 'name code price' },
                { path: 'serviceDetails.approvedBy', select: 'name avt' },
                { path: 'serviceDetails.payments.receivedBy', select: 'name avt' },
                { path: 'serviceDetails.commissions.user', select: 'name avt' },
                { path: 'serviceDetails.costs.createdBy', select: 'name avt' },
            ])
            .sort({ createAt: -1 })
            .limit(limit) // CHỈ lấy số lượng giới hạn
            .lean();

        // Loại bỏ care logs đầy đủ, chỉ giữ lại 5 item cuối cùng để preview
        const customersWithLimitedCare = customers.map(customer => {
            const care = Array.isArray(customer.care) ? customer.care : [];
            return {
                ...customer,
                care: care.slice(-5), // Chỉ lấy 5 care logs mới nhất
                careCount: care.length, // Lưu tổng số để biết còn bao nhiêu
            };
        });

        // Trả về bản sao JSON-safe
        return JSON.parse(JSON.stringify(customersWithLimitedCare));
    } catch (error) {
        console.error('Lỗi trong dataCustomer:', error);
        throw new Error('Không thể lấy dữ liệu khách hàng.');
    }
}

/**
 * Lấy danh sách khách hàng (có cache, giới hạn số lượng).
 * CHỈ cache một phần dữ liệu (mặc định 100 customers mới nhất) để tránh vượt quá 2MB.
 * Đã loại bỏ care logs đầy đủ, chỉ cache 5 care logs mới nhất cho mỗi khách hàng.
 * 
 * @param {Object} options - Tùy chọn
 * @param {number} options.limit - Số lượng customers cần cache (mặc định 100, tối đa 200)
 */
export async function getCustomersAll(options = {}) {
    try {
        // Giới hạn tối đa 200 để đảm bảo không vượt quá 2MB
        const limit = Math.min(options.limit || 100, 200);
        
        // Cache theo limit để có thể cache nhiều "trang" khác nhau
        const cacheKey = limit === 100 ? 'customers' : `customers:limit:${limit}`;
        const cachedFunction = cacheData(() => dataCustomer({ limit }), [cacheKey]);
        return await cachedFunction();
    } catch (error) {
        // Nếu lỗi do vượt quá giới hạn cache (2MB), giảm limit và thử lại
        if (error?.message?.includes('items over 2MB') || error?.message?.includes('can not be cached')) {
            console.warn('⚠️ Dữ liệu khách hàng quá lớn để cache (>2MB), đang giảm số lượng...');
            // Thử với limit nhỏ hơn (50)
            try {
                return await dataCustomer({ limit: 50 });
            } catch (retryError) {
                console.error('Lỗi khi retry với limit nhỏ hơn:', retryError);
                throw new Error('Không thể lấy danh sách khách hàng.');
            }
        }
        console.error('Lỗi trong getCustomersAll:', error);
        throw new Error('Không thể lấy danh sách khách hàng.');
    }
}

/**
 * Lấy care logs (lịch sử tương tác) của một khách hàng theo phân trang.
 * KHÔNG cache vì dữ liệu có thể rất lớn và thay đổi thường xuyên.
 * 
 * @param {string} customerId - ID khách hàng
 * @param {Object} options - Tùy chọn phân trang
 * @param {number} options.page - Trang hiện tại (bắt đầu từ 1)
 * @param {number} options.limit - Số lượng items mỗi trang (mặc định 20)
 * @returns {Promise<{logs: Array, total: number, page: number, limit: number, totalPages: number}>}
 */
export async function getCustomerCareLogs(customerId, options = {}) {
    try {
        const { page = 1, limit = 20 } = options;
        const skip = (page - 1) * limit;

        await connectDB();

        const customer = await Customer.findById(customerId)
            .select('care')
            .populate({ path: 'care.createBy', select: 'name avt' })
            .lean();

        if (!customer) {
            return { logs: [], total: 0, page, limit, totalPages: 0 };
        }

        const care = Array.isArray(customer.care) ? customer.care : [];
        const total = care.length;
        const totalPages = Math.ceil(total / limit);

        // Sắp xếp theo thời gian mới nhất trước, sau đó lấy theo phân trang
        const sortedCare = [...care].sort((a, b) => {
            const dateA = new Date(a.createAt || 0);
            const dateB = new Date(b.createAt || 0);
            return dateB - dateA; // Mới nhất trước
        });

        const paginatedCare = sortedCare.slice(skip, skip + limit);

        return {
            logs: JSON.parse(JSON.stringify(paginatedCare)),
            total,
            page,
            limit,
            totalPages,
        };
    } catch (error) {
        console.error('Lỗi trong getCustomerCareLogs:', error);
        throw new Error('Không thể lấy lịch sử tương tác của khách hàng.');
    }
}
