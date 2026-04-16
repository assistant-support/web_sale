import LabelCall from '@/models/labelCall.model';

/** Mẫu mặc định — chỉ insert khi collection `labelCall` còn trống (lần đầu có dữ liệu). */
export const DEFAULT_LABEL_CALL_NAMES = [
    'Đã nghe máy',
    'sai số',
    'thuê bao',
    'từ chối nói chuyện',
    'máy bận',
    'đã tư vấn',
];

/**
 * Đảm bảo có sẵn các thẻ mặc định. Không thêm bản ghi nếu đã có ít nhất một document.
 * Hàm này giả định mongoose đã được connect từ caller (connectDB).
 */
export async function ensureLabelCallDefaults() {
    const count = await LabelCall.countDocuments();
    if (count > 0) return;

    try {
        await LabelCall.insertMany(DEFAULT_LABEL_CALL_NAMES.map((name) => ({ name })));
    } catch (err) {
        // Tránh lỗi khi hai process cùng seed (duplicate key)
        if (err?.code !== 11000) throw err;
    }
}
