import mongoose from 'mongoose';

/**
 * Model lưu conversations từ Pancake
 * Dùng cho analytics và self-healing, không dùng để hiển thị trực tiếp
 */
const ConversationsPancakeSchema = new mongoose.Schema(
    {
        conversationId: {
            type: String,
            required: true,
            unique: true,
            index: true,
        },
        pageId: {
            type: String,
            required: true,
            index: true,
        },
        name: {
            type: String,
            trim: true,
        },
        phone: {
            type: String,
            trim: true,
        },
        tagIds: {
            type: [String],
            default: [],
            index: true,
        },
        lastMessageAt: {
            type: Date,
            index: true,
        },
        snippet: {
            type: String,
            trim: true,
        },
        updated_at: {
            type: Date,
            default: Date.now,
            index: true,
        },
        type: {
            type: String,
            enum: ['INBOX', 'COMMENT', 'POST_COMMENT'],
            default: 'INBOX',
        },
        customers: {
            type: mongoose.Schema.Types.Mixed,
            default: [],
        },
        from: {
            type: mongoose.Schema.Types.Mixed,
            default: null,
        },
        // Lưu thêm các field khác từ Pancake API
        extraData: {
            type: mongoose.Schema.Types.Mixed,
            default: {},
        },
    },
    { timestamps: true }
);

// Indexes
ConversationsPancakeSchema.index({ pageId: 1, lastMessageAt: -1 });
ConversationsPancakeSchema.index({ pageId: 1, tagIds: 1 });
ConversationsPancakeSchema.index({ tagIds: 1 });

export default mongoose.models.ConversationsPancake || mongoose.model('ConversationsPancake', ConversationsPancakeSchema);

