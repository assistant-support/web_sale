// web_tslhu/models/variant.js
import { Schema, model, models } from "mongoose";

const VariantSchema = new Schema(
  {
    name: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true, // Đảm bảo tên luôn là chữ thường để dễ truy vấn
    },
    description: {
      type: String,
      trim: true,
    },
    words: [
      {
        type: String,
        trim: true,
      },
    ],
  },
  { timestamps: true },
);

const Variant = models.variant || model("variant", VariantSchema);

export default Variant;
