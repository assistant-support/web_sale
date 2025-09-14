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
            type: [String],
            enum: ['new_unconfirmed_1', 'missing_info_1', 'not_valid_1', 'msg_success_2', 'msg_error_2', 'duplicate_merged_1', 'rejected_immediate_1', 'valid_1', 'noikhoa_3', 'ngoaikhoa_3', 'undetermined_3', 'consulted_pending_4', 'scheduled_unconfirmed_4', 'callback_4', 'not_interested_4',
                'no_contact_4', 'confirmed_5', 'postponed_5', 'canceled_5', 'serviced_completed_6', 'serviced_in_progress_6', 'rejected_after_consult_6'
            ],
            default: 'new_unconfirmed'
        },
        zaloPhase: { type: String, enum: ['welcome', 'nurturing', 'pre_surgery', 'post_surgery', 'longterm'], default: null },
        tags: { type: [{ type: Schema.Types.ObjectId, ref: 'service' }], default: [] },
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
        },
        serviceDetails: {
            // Trạng thái xử lý chung
            status: { type: String, enum: ['new', 'in_progress', 'completed'], default: 'new' },
            notes: { type: String, trim: true },

            // Dịch vụ quan tâm & dịch vụ đã chốt
            interestedServices: {
                type: [{ type: Schema.Types.ObjectId, ref: 'service' }], // dịch vụ KH quan tâm
                default: []
            },
            selectedService: { type: Schema.Types.ObjectId, ref: 'service' }, // dịch vụ chốt (nếu có 1 dịch vụ chính)

            // Thông tin giá/giảm giá/chốt
            pricing: {
                listPrice: { type: Number, default: 0 }, // giá gốc/niêm yết
                discountType: { type: String, enum: ['none', 'amount', 'percent'], default: 'none' }, // giảm theo tiền hoặc %
                discountValue: { type: Number, default: 0 }, // số tiền hoặc %
                finalPrice: { type: Number, default: 0 }, // giá sau giảm (mục tiêu chốt)
            },

            // Thanh toán (nhiều đợt)
            payments: {
                type: [{
                    amount: { type: Number, required: true }, // số tiền thu ở đợt này
                    method: { type: String, enum: ['cash', 'card', 'transfer', 'momo', 'zalopay', 'other'], default: 'cash' },
                    paidAt: { type: Date, default: Date.now },
                    receivedBy: { type: Schema.Types.ObjectId, ref: 'user' },
                    note: { type: String, trim: true }
                }],
                default: []
            },
            amountReceivedTotal: { type: Number, default: 0 }, // tổng tiền đã nhận (cộng dồn từ payments)
            outstandingAmount: { type: Number, default: 0 },   // công nợ còn lại = finalPrice - amountReceivedTotal

            // Chi phí (để tính lợi nhuận)
            costs: {
                type: [{
                    label: { type: String, trim: true }, // mô tả: vật tư, CTV, marketing,...
                    amount: { type: Number, required: true, default: 0 },
                    createdAt: { type: Date, default: Date.now },
                    createdBy: { type: Schema.Types.ObjectId, ref: 'user' }
                }],
                default: []
            },

            // Chia hoa hồng cho các nhân sự liên quan (nhập tay)
            commissions: {
                type: [{
                    user: { type: Schema.Types.ObjectId, ref: 'user', required: true },
                    role: { type: String, trim: true }, // ví dụ: 'sale', 'doctor', 'referrer'...
                    percent: { type: Number, default: 0 }, // % hoa hồng
                    amount: { type: Number, default: 0 }   // tiền hoa hồng (nếu nhập tay)
                }],
                default: []
            },

            // Quy trình duyệt chốt đơn
            approval: {
                state: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
                approvedBy: { type: Schema.Types.ObjectId, ref: 'user' },
                approvedAt: { type: Date },
                reason: { type: String, trim: true } // ghi chú khi reject/approve
            },

            // Thông tin kết sổ hiện tại bạn đang có — giữ nguyên + có thể đồng bộ với pricing/payments
            closedAt: { type: Date },
            closedBy: { type: Schema.Types.ObjectId, ref: 'user' },
            invoiceDriveId: { type: String },

            // Doanh thu ghi nhận (tuỳ chính sách: có thể gán = finalPrice hoặc = amountReceivedTotal)
            revenue: { type: Number, default: 0 }
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