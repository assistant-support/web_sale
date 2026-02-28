import mongoose from 'mongoose';

const LabelSchema = new mongoose.Schema({
    name: {
        type: String,
        required: [true, 'Vui lòng cung cấp tên nhãn.'],
        trim: true,
        maxlength: [50, 'Tên nhãn không được vượt quá 50 ký tự.'],
    },
    color: {
        type: String,
        required: [true, 'Vui lòng cung cấp màu cho nhãn.'],
        trim: true,
    },
    customer: {
        type: mongoose.Schema.Types.Mixed,
        default: {},
    },
    // Thêm các field cho Pancake tags
    from: {
        type: String,
        enum: ['pancake', 'manual'], // 'pancake' = từ Pancake API, 'manual' = tạo thủ công
        default: 'manual',
    },
    tagId: {
        type: String,
        // ID từ Pancake (chỉ có khi from = 'pancake')
        required: function() {
            return this.from === 'pancake';
        },
        index: true,
    },
    tagIndex: {
        type: Number,
        // Vị trí trong settings.tags array (chỉ có khi from = 'pancake')
        // QUAN TRỌNG: Pancake dùng tagIndex để filter, không phải tagId
        default: null,
    },
    pageId: {
        type: String,
        // Page ID từ Pancake (chỉ có khi from = 'pancake')
        required: function() {
            return this.from === 'pancake';
        },
        index: true,
    },
    lightenColor: {
        type: String,
        default: '',
        trim: true,
    },
    isLeadEvent: {
        type: Boolean,
        default: false,
    },
    // Thêm lastSyncedAt cho Pancake tags (để cache)
    lastSyncedAt: {
        type: Date,
        default: null,
        // Chỉ có khi from = 'pancake'
    },
}, { timestamps: true });

// UNIQUE INDEX cho tags từ Pancake (pageId + tagId) - RẤT QUAN TRỌNG
// Sử dụng sparse để chỉ áp dụng khi cả pageId và tagId đều có giá trị
LabelSchema.index(
    { pageId: 1, tagId: 1 },
    { 
        unique: true,
        sparse: true // Chỉ áp dụng unique khi cả pageId và tagId đều không null
    }
);

// Index để tìm tags từ Pancake
LabelSchema.index({ from: 1, pageId: 1 });

// Index để so sánh tags (theo name và tagId)
LabelSchema.index({ from: 1, pageId: 1, name: 1 });
LabelSchema.index({ from: 1, pageId: 1, tagId: 1 });
LabelSchema.index({ from: 1, pageId: 1, tagIndex: 1 });

// Unique constraint chỉ áp dụng cho labels thủ công (không phải từ Pancake).
// Nếu DB có index cũ name_1 unique toàn cục → sync Pancake tags bị E11000 khi trùng tên giữa các page.
// Sửa: trong MongoDB chạy: db.labelfbs.dropIndex("name_1") rồi restart app để Mongoose tạo lại partial index.
LabelSchema.index(
    { name: 1 }, 
    { 
        unique: true, 
        partialFilterExpression: { from: { $ne: 'pancake' } } 
    }
);

export default mongoose.models.Labelfb || mongoose.model('Labelfb', LabelSchema);
