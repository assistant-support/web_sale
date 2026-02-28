// models/service_details.model.js
import { Schema, model, models } from 'mongoose';

const PaymentSchema = new Schema(
    {
        amount: { type: Number, required: true, min: 0 },
        method: { type: String, enum: ['cash', 'card', 'transfer', 'momo', 'zalopay', 'other'], default: 'cash' },
        paidAt: { type: Date, default: Date.now },
        receivedBy: { type: Schema.Types.ObjectId, ref: 'user' },
        note: { type: String, trim: true },
    },
    { _id: false }
);

const CostSchema = new Schema(
    {
        label: { type: String, trim: true },
        amount: { type: Number, required: true, default: 0, min: 0 },
        createdAt: { type: Date, default: Date.now },
        createdBy: { type: Schema.Types.ObjectId, ref: 'user' },
    },
    { _id: false }
);

const CommissionSchema = new Schema(
    {
        user: { type: Schema.Types.ObjectId, ref: 'user', required: true },
        role: { type: String, trim: true }, // sale, doctor, referrer...
        percent: { type: Number, default: 0, min: 0 },
        amount: { type: Number, default: 0, min: 0 },
    },
    { _id: false }
);

const SelectedCourseSchema = new Schema({
    name: { type: String, required: true },
    description: { type: String },
    costs: {
        basePrice: { type: Number, default: 0 },
        fullMedication: { type: Number, default: 0 },
        partialMedication: { type: Number, default: 0 },
        otherFees: { type: Number, default: 0 },
    },
    medicationName: { type: String, trim: true, default: '' },
    medicationDosage: { type: String, trim: true, default: '' },
    medicationUnit: { type: String, trim: true, default: '' },
    consultantName: { type: String, trim: true, default: '' },
    doctorName: { type: String, trim: true, default: '' },
}, { _id: false });

const ServiceDetailSchema = new Schema(
    {
        // Reference đến customer
        customerId: { type: Schema.Types.ObjectId, ref: 'customer', required: true, index: true },
        
        // Reference đến service
        serviceId: { type: Schema.Types.ObjectId, ref: 'service', required: true, index: true },
        
        // Reference đến nguồn (source)
        sourceId: { type: Schema.Types.ObjectId, ref: 'form', index: true },
        sourceDetails: { type: String, trim: true }, // Chi tiết nguồn (ví dụ: "nhập trực tiếp tại quầy")
        
        // Trạng thái duyệt đơn
        approvalStatus: { 
            type: String, 
            enum: ['pending', 'approved', 'rejected'], 
            default: 'pending',
            index: true 
        },
        approvedBy: { type: Schema.Types.ObjectId, ref: 'user' },
        approvedAt: { type: Date },
        
        // Trạng thái xử lý đơn
        status: { 
            type: String, 
            enum: ['processing', 'completed', 'cancelled'], 
            default: 'processing' 
        },
        
        // Ghi chú
        notes: { type: String, trim: true },
        
        // Dịch vụ và Liệu trình liên quan
        interestedServices: { type: [{ type: Schema.Types.ObjectId, ref: 'service' }], default: [] },
        selectedCourse: { type: SelectedCourseSchema },
        
        // Giá/giảm giá/chốt
        pricing: {
            listPrice: { type: Number, default: 0, min: 0 },
            discountType: { type: String, enum: ['none', 'amount', 'percent'], default: 'none' },
            discountValue: { type: Number, default: 0, min: 0 },
            adjustmentType: { type: String, enum: ['none', 'discount', 'increase'], default: 'none' },
            adjustmentValue: { type: Number, default: 0, min: 0 },
            finalPrice: { type: Number, default: 0, min: 0 },
        },
        // Chương trình khuyến mãi (tên và id)
        name_CTKM: { type: String, trim: true, default: '' },
        idCTKM: { type: Schema.Types.ObjectId, ref: 'discountprogram', default: null },
        
        // Thanh toán nhiều đợt
        payments: { type: [PaymentSchema], default: [] },
        
        // Tổng đã nhận & công nợ
        amountReceivedTotal: { type: Number, default: 0, min: 0 },
        outstandingAmount: { type: Number, default: 0, min: 0 },
        
        // Chi phí & hoa hồng
        costs: { type: [CostSchema], default: [] },
        commissions: { type: [CommissionSchema], default: [] },
        
        // Doanh thu ghi nhận
        revenue: { type: Number, default: 0, min: 0 },
        
        // Thông tin kết sổ/invoice
        closedAt: { 
            type: Date, 
            index: true 
        },
        closedBy: { type: Schema.Types.ObjectId, ref: 'user' },
        invoiceDriveIds: { type: [String], default: [] },
        customerPhotosDriveIds: { type: [String], default: [] },
        
        // Thông tin tạo đơn
        createdAt: { type: Date, default: Date.now, index: true },
        createdBy: { type: Schema.Types.ObjectId, ref: 'user' },
    },
    { 
        timestamps: true,
        versionKey: false 
    }
);

// Indexes để tối ưu query
ServiceDetailSchema.index({ approvalStatus: 1, closedAt: 1 });
ServiceDetailSchema.index({ customerId: 1, createdAt: -1 });
ServiceDetailSchema.index({ createdAt: -1 });
ServiceDetailSchema.index({ closedAt: -1 });
ServiceDetailSchema.index({ serviceId: 1, closedAt: -1 });
ServiceDetailSchema.index({ sourceId: 1, closedAt: -1 });
ServiceDetailSchema.index({ sourceId: 1, serviceId: 1, closedAt: -1 });

const ServiceDetail = models.service_detail || model('service_detail', ServiceDetailSchema);

export default ServiceDetail;

