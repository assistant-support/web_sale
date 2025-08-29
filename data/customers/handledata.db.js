import Customer from '@/models/customer'
import connectDB from '@/config/connectDB'
import { cacheData } from '@/lib/cache' // Giả sử bạn có một hàm cacheData tương tự

/**
 * Hàm gốc để truy vấn tất cả dữ liệu khách hàng, chưa có cache.
 * Hàm này không được export ra ngoài.
 * @returns {Promise<Array>} - Mảng chứa tất cả đối tượng khách hàng.
 */
async function dataCustomer() {
    try {
        await connectDB();

        // Sử dụng find({}) để lấy tất cả document
        const customers = await Customer.find({})
            // Populate các trường tham chiếu để lấy thông tin cần thiết
            // Chỉ chọn những trường (fields) cần thiết để tối ưu hóa lượng dữ liệu trả về
            .populate({
                path: 'source', // Trường tham chiếu trong Customer model
                select: 'name' // Chỉ lấy trường 'name' từ model Form
            })
            .populate({
                path: 'roles', // Trường tham chiếu mảng trong Customer model
                select: 'name avt' // Lấy trường 'name' và 'avt' từ model User
            })
            .sort({ createAt: -1 }) // Sắp xếp theo ngày tạo mới nhất
            .lean(); // Sử dụng .lean() để tăng tốc độ truy vấn, trả về plain JavaScript objects

        // Mặc dù .lean() đã trả về object thuần, việc dùng JSON.parse(JSON.stringify())
        // đảm bảo loại bỏ hoàn toàn mọi phương thức hoặc thuộc tính của Mongoose, an toàn cho việc serialization.
        return JSON.parse(JSON.stringify(customers));
    } catch (error) {
        console.error('Lỗi trong dataCustomer:', error);
        throw new Error('Không thể lấy dữ liệu khách hàng.');
    }
}

/**
 * Lấy danh sách TẤT CẢ khách hàng (có cache).
 * Đây là hàm duy nhất được export ra ngoài để các nơi khác trong ứng dụng sử dụng.
 * @returns {Promise<Array>}
 */
export async function getCustomersAll() {
    try {
        // Tạo một hàm đã được bọc cache.
        // Tag cache là 'customers', giúp chúng ta có thể revalidate (xóa cache)
        // cho tất cả khách hàng khi có một khách hàng mới được tạo hoặc cập nhật.
        const cachedFunction = cacheData(
            () => dataCustomer(),
            ['customers'] // Mảng chứa các tag/key cho việc revalidate
        );

        // Gọi và trả về kết quả từ hàm đã được cache.
        return await cachedFunction();
    } catch (error) {
        // Lỗi đã được log ở hàm gốc, ở đây chỉ cần throw lại để nơi gọi xử lý.
        console.error('Lỗi trong getCustomersAll:', error);
        throw new Error('Không thể lấy danh sách tất cả khách hàng.');
    }
}