// models/call.model.js
import mongoose from 'mongoose';

const { Schema } = mongoose;

/**
 * Model lưu thông tin cuộc gọi
 * - customer: người thực hiện gọi (tham chiếu Customer)
 * - user: người được gọi (tham chiếu User)
 * - file: đường dẫn / id file ghi âm
 * - createdAt: thời điểm bắt đầu cuộc gọi
 * - duration: thời lượng cuộc gọi (giây)
 * - status: trạng thái cuộc gọi
 */

const CallStatus = [
    'completed',   // gọi thành công và có kết nối
    'missed',      // bỏ lỡ
    'rejected',    // bị từ chối
    'no_answer',   // không bắt máy
    'busy',        // máy bận
    'failed',      // lỗi kỹ thuật
    'voicemail',   // vào hộp thư thoại
    'ongoing'      // đang diễn ra (nếu cần lưu tạm thời)
];

const CallSchema = new Schema(
    {
        customer: {
            type: Schema.Types.ObjectId,
            ref: 'customer',
            required: true,
            index: true
        },
        user: {
            type: Schema.Types.ObjectId,
            ref: 'user',
            required: true,
            index: true
        },
        file: {
            // Có thể là URL, đường dẫn nội bộ, hoặc ID file (VD: Google Drive)
            type: String,
            default: ''
        },
        createdAt: {
            // Thời điểm bắt đầu gọi
            type: Date,
            default: () => new Date(),
            index: true
        },
        duration: {
            // Thời gian gọi (đơn vị: giây)
            type: Number,
            min: 0,
            default: 0
        },
        status: {
            type: String,
            enum: CallStatus,
            required: true,
            default: 'ongoing',
            index: true
        },

        // (Tuỳ chọn) thêm ghi chú/ngữ cảnh nếu bạn muốn
        note: {
            type: String,
            default: ''
        },
        // (Tuỳ chọn) metadata lưu thêm info từ tổng đài (callId, fromNumber, toNumber, v.v.)
        meta: {
            type: Schema.Types.Mixed,
            default: {},
            
        }
    },
    {
        // Không dùng timestamps mặc định vì bạn đã có createdAt riêng để phản ánh thời điểm gọi
        versionKey: false,
        toJSON: { virtuals: true },
        toObject: { virtuals: true }
    }
);

// Index kết hợp để truy vấn nhanh lịch sử gọi giữa 2 bên
CallSchema.index({ customer: 1, user: 1, createdAt: -1 });

const Call = mongoose.models.Call || mongoose.model('Call', CallSchema);
export default Call;
export { CallStatus };
