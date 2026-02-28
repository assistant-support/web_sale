import mongoose from 'mongoose';

/**
 * Bảng trung gian: conversation ↔ label (tag)
 * Dùng để query nhanh conversations theo label
 */
const ConversationLabelSchema = new mongoose.Schema(
    {
        conversationId: {
            type: String,
            required: true,
            index: true,
        },
        labelId: {
            type: String,
            required: true,
            index: true,
        },
        pageId: {
            type: String,
            required: true,
            index: true,
        },
    },
    { timestamps: true }
);

// Unique index: một conversation chỉ có một label một lần
ConversationLabelSchema.index(
    { conversationId: 1, labelId: 1, pageId: 1 },
    { unique: true }
);

// Index để query nhanh
ConversationLabelSchema.index({ labelId: 1, pageId: 1 });
ConversationLabelSchema.index({ conversationId: 1 });

export default mongoose.models.ConversationLabel || mongoose.model('ConversationLabel', ConversationLabelSchema);

