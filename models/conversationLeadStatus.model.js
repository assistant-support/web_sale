import mongoose from 'mongoose';

/**
 * Model lưu trạng thái LEAD/NOT LEAD của conversations
 * - LEAD: conversation là lead
 * - NOT LEAD: conversation không phải lead (có thể có note lý do)
 */
const ConversationLeadStatusSchema = new mongoose.Schema(
    {
        conversationId: {
            type: String,
            required: true,
            index: true,
        },
        pageId: {
            type: String,
            required: true,
            index: true,
        },
        status: {
            type: String,
            enum: ['LEAD', 'NOT_LEAD'],
            required: true,
            index: true,
        },
        note: {
            type: String,
            trim: true,
            // Chỉ có khi status = 'NOT_LEAD'
            default: null,
        },
        labelId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Labelfb',
            // ID của label "NOT LEAD" hoặc "LEAD" được gán
            default: null,
        },
        // Tên khách hàng của cuộc hội thoại (để lọc khách hàng theo thẻ)
        name: {
            type: String,
            trim: true,
            default: null,
        },
        // Tên hiển thị page: "Tin nhắn - {platformName} - {pageName}"
        pageDisplayName: {
            type: String,
            trim: true,
            default: null,
        },
        // ID khách hàng (Pancake/cuộc hội thoại) - customers[0].id hoặc fb_id
        idcustomers: {
            type: String,
            trim: true,
            default: null,
            index: true,
        },
    },
    { timestamps: true }
);

// Unique index: mỗi conversation chỉ có 1 status
ConversationLeadStatusSchema.index(
    { conversationId: 1, pageId: 1 },
    { unique: true }
);

// Index để query nhanh
ConversationLeadStatusSchema.index({ pageId: 1, status: 1 });
ConversationLeadStatusSchema.index({ conversationId: 1 });
ConversationLeadStatusSchema.index({ labelId: 1 });
ConversationLeadStatusSchema.index({ pageDisplayName: 1, name: 1 });

export default mongoose.models.ConversationLeadStatus || mongoose.model('ConversationLeadStatus', ConversationLeadStatusSchema);

