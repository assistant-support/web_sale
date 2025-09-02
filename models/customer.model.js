import { Schema, model, models } from 'mongoose';

const FormSchema = new Schema(
    {
        name: { type: String, required: true, trim: true },
        // Remove bd nếu không cần giai đoạn 1
        email: { type: String, trim: true, match: /^[^\s@]+@[^\s@]+\.[^\s@]+$/ }, // Thêm validator
        phone: { type: String, trim: true, unique: true, match: /^0\d{9}$/ }, // Unique + match
        // Remove nameparent nếu không dùng, hoặc optional
        area: { type: String, trim: true },
        source: { type: Schema.Types.ObjectId, ref: 'form', required: true },
        sourceDetails: { type: String, trim: true },
        uid: { type: [{ zalo: { type: Schema.Types.ObjectId, ref: 'user' }, uid: String, isFriend: { type: Number, default: 0 }, isReques: { type: Number, default: 0 } }] },
        createAt: { type: Date, default: Date.now },
        care: { type: [{ content: String, step: Number, createBy: { type: Schema.Types.ObjectId, ref: 'user' }, createAt: { type: Date, default: Date.now } }], default: [] },
        zaloavt: String,
        zaloname: String,
        assignees: { type: [{ user: { type: Schema.Types.ObjectId, ref: 'user' }, group: { type: String, enum: ['noi_khoa', 'ngoai_khoa'] }, assignedAt: { type: Date, default: Date.now } }], default: [] },
        pipelineStatus: {
            type: String,
            enum: ['new_unconfirmed', 'missing_info', 'valid_waiting_msg', 'duplicate_merged', 'rejected_immediate', 'valid', 'assigned', 'consulted', 'appointed', 'serviced', 'rejected'], // Mở rộng theo PDF
            default: 'new_unconfirmed'
        },
        zaloPhase: { type: String, enum: ['welcome', 'nurturing', 'pre_surgery', 'post_surgery', 'longterm'], default: null },
        tags: { type: [String], default: [] },
        roles: {
            type: [{ type: Schema.Types.ObjectId, ref: 'user', required: true }],
            default: []
        },
        workflowTemplates: { type: [Schema.Types.ObjectId], ref: 'workflowtemplate', default: [] },
        assignee: { 
            type: Schema.Types.ObjectId, 
            ref: 'user',
            default: null 
        },
        assignedBy: { 
            type: Schema.Types.ObjectId, 
            ref: 'user',
            default: null 
        },
        assignedAt: { 
            type: Date,
            default: null 
        },
        isAutoAssigned: {
            type: Boolean,
            default: false
        }
    },
    { timestamps: false, versionKey: false }
);

FormSchema.pre('save', function (next) {
    if (this.phone) this.phone = this.phone.replace(/\D/g, '');
    if (this.name) this.name = this.name.trim().replace(/\s+/g, ' ').split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()).join(' '); // Chuẩn hóa name
    next();
});

FormSchema.index({ phone: 1 }, { unique: true });
FormSchema.index({ source: 1 });
FormSchema.index({ tags: 1 });

const Customer = models.customer || model('customer', FormSchema);
export default Customer;