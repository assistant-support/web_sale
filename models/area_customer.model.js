import { Schema, model, models } from 'mongoose'

const AreaCustomerSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    id_customer: { type: [{ type: Schema.Types.ObjectId, ref: 'customer' }], default: [] },
    type_area: { type: String, trim: true }
  },
  { timestamps: false, versionKey: false, collection: 'area_customer' }
)

// QUAN TRỌNG: Tham số thứ 3 là collection name - phải khớp với collection trong MongoDB
const AreaCustomer = models.area_customer || model('area_customer', AreaCustomerSchema, 'area_customer')
export default AreaCustomer

