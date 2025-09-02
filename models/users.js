import { Schema, model, models } from 'mongoose'

const postUser = new Schema({
  name: {
    type: String,
  },
  address: {
    type: String,
  },
  avt: {
    type: String,
  },
  role: {
    type: Array,
  },
  phone: {
    type: String,
  },
  email: {
    type: String,
  },
  zalo: {
    type: Schema.Types.ObjectId, ref: 'zaloaccount'
  },
  uid: {
    type: String, 
  }
}, { timestamps: true })

const users = models.user || model('user', postUser)

export default users