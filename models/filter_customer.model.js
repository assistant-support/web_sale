import { Schema, model, models } from 'mongoose'

const FilterCustomerSchema = new Schema(
    {
        month1: { type: [{ type: Schema.Types.ObjectId, ref: 'customer' }], default: [] },
        month2: { type: [{ type: Schema.Types.ObjectId, ref: 'customer' }], default: [] },
        month3: { type: [{ type: Schema.Types.ObjectId, ref: 'customer' }], default: [] },
        month4: { type: [{ type: Schema.Types.ObjectId, ref: 'customer' }], default: [] },
        month5: { type: [{ type: Schema.Types.ObjectId, ref: 'customer' }], default: [] },
        month6: { type: [{ type: Schema.Types.ObjectId, ref: 'customer' }], default: [] },
        month7: { type: [{ type: Schema.Types.ObjectId, ref: 'customer' }], default: [] },
        month8: { type: [{ type: Schema.Types.ObjectId, ref: 'customer' }], default: [] },
        month9: { type: [{ type: Schema.Types.ObjectId, ref: 'customer' }], default: [] },
        month10: { type: [{ type: Schema.Types.ObjectId, ref: 'customer' }], default: [] },
        month11: { type: [{ type: Schema.Types.ObjectId, ref: 'customer' }], default: [] },
        month12: { type: [{ type: Schema.Types.ObjectId, ref: 'customer' }], default: [] },
    },
    { timestamps: false, versionKey: false, collection: 'Fillter_customer' }
)

// Thử cả 2 tên collection: Fillter_customer (có thể có typo) và Filter_customer
const FilterCustomer = models.Fillter_customer || models.Filter_customer || model('Fillter_customer', FilterCustomerSchema, 'Fillter_customer')
export default FilterCustomer

