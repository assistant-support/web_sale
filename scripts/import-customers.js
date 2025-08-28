// ++ ADDED: Toàn bộ file script mới, sửa lỗi Google Sheet và tương thích model
import mongoose from "mongoose";
import { google } from "googleapis";
import dotenv from "dotenv";

// Tải biến môi trường
dotenv.config({ path: ".env" });

// --- Cấu hình ---
const GOOGLE_SHEET_ID = "1wGBu5rwCYnAIsQPAJcIkGQ_3fU2lK7pW3eoxhBGgjLM"; // << THAY ID CỦA BẠN VÀO ĐÂY
const SHEET_NAME = "DL ĐKNV"; // << CHỈ ĐIỀN TÊN SHEET, ví dụ: 'Sheet1' hoặc 'Dữ liệu khách hàng'
const GOOGLE_SHEET_RANGE = `'${SHEET_NAME}'!C2:E`; // ** MODIFIED: Tự động thêm nháy đơn để tránh lỗi
const DEFAULT_STATUS_ID = "68a3dee83990c11a2632e310";
const ADMIN_USER_ID = "6865fe3ccdec836f29fabe4f"; // << THAY ID ADMIN CỦA BẠN VÀO ĐÂY
// --- Kết thúc cấu hình ---

const { Schema, model, models } = mongoose;

// --- Định nghĩa Schema tương thích với model customer.js ---
const UidEntrySchema = new Schema(
  {
    zaloId: { type: Schema.Types.ObjectId, ref: "zaloaccount", required: true },
    uid: { type: String, required: true },
  },
  { _id: false },
);

const ActionRefSchema = new Schema(
  {
    job: { type: Schema.Types.ObjectId, ref: "scheduledjob", required: true },
    zaloAccount: {
      type: Schema.Types.ObjectId,
      ref: "zaloaccount",
      required: true,
    },
    actionType: {
      type: String,
      enum: ["sendMessage", "addFriend", "findUid"],
      required: true,
    },
    status: {
      type: String,
      enum: ["pending", "processing", "completed", "failed"],
      default: "pending",
    },
  },
  { _id: false },
);

const CommentSchema = new Schema({
  user: { type: Schema.Types.ObjectId, ref: "user", required: true },
  stage: { type: Number, required: true },
  detail: { type: String, required: true },
  time: { type: Date, default: Date.now },
});

const CustomerSchema = new Schema(
  {
    name: { type: String },
    phone: { type: String, required: true, unique: true },
    uid: { type: [UidEntrySchema], default: [] },
    status: { type: Schema.Types.ObjectId, ref: "status" },
    stageLevel: { type: Number, default: 0 },
    comments: [CommentSchema],
    users: [{ type: Schema.Types.ObjectId, ref: "user" }],
    action: [ActionRefSchema],
  },
  { timestamps: true, strict: false },
);

// --- Khởi tạo Models ---
const Customer = models.customer || model("customer", CustomerSchema);

// --- Hàm tiện ích ---
let isConnected = false;
const connectDB = async () => {
  if (isConnected) return;
  if (mongoose.connections[0].readyState) {
    isConnected = true;
    return;
  }
  try {
    const db = await mongoose.connect(process.env.MONGODB_URI);
    isConnected = db.connections[0].readyState === 1;
  } catch (error) {
    throw new Error("Failed to connect to MongoDB: " + error);
  }
};

async function getGoogleSheetsClient() {
  const auth = new google.auth.GoogleAuth({
    credentials: {
      client_email: process.env.GOOGLE_CLIENT_EMAIL,
      private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
    },
    scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
  });
  return google.sheets({ version: "v4", auth });
}

const normalizePhone = (phone) => {
  if (!phone || typeof phone !== "string") return null;
  let cleaned = phone.replace(/\s+/g, "");
  if (cleaned.startsWith("84")) {
    cleaned = "0" + cleaned.substring(2);
  }
  if (cleaned.length === 9 && !cleaned.startsWith("0")) {
    cleaned = "0" + cleaned;
  }
  return cleaned.length === 10 && cleaned.startsWith("0") ? cleaned : null;
};

// --- Logic chính của Script ---
async function runImport() {
  console.log("🚀 Bắt đầu script nhập liệu khách hàng (phiên bản sửa lỗi)...");

  try {
    await connectDB();
    console.log("🍃 Kết nối MongoDB thành công.");

    if (!ADMIN_USER_ID || ADMIN_USER_ID === "YOUR_ADMIN_OBJECT_ID_HERE") {
      throw new Error(
        "Vui lòng cung cấp một ID Admin hợp lệ trong biến ADMIN_USER_ID.",
      );
    }
    console.log(`👤 Sử dụng Admin ID "${ADMIN_USER_ID}" cho các ghi chú.`);

    console.log(
      `📊 Đang đọc dữ liệu từ Sheet ID: ${GOOGLE_SHEET_ID}, Range: ${GOOGLE_SHEET_RANGE}`,
    );
    const sheets = await getGoogleSheetsClient();
    const { data } = await sheets.spreadsheets.values.get({
      spreadsheetId: GOOGLE_SHEET_ID,
      range: GOOGLE_SHEET_RANGE,
    });
    const rows = data.values || [];
    if (rows.length === 0) {
      console.log("✅ Không có dữ liệu nào trong Sheet. Kết thúc.");
      return;
    }
    console.log(`   -> Đã đọc được ${rows.length} hàng.`);

    console.log("🔍 Lấy danh sách SĐT hiện có trong database...");
    const existingCustomers = await Customer.find({}, "phone").lean();
    const existingPhones = new Set(existingCustomers.map((c) => c.phone));
    console.log(`   -> Có ${existingPhones.size} khách hàng trong DB.`);

    console.log("⚙️  Xử lý và phân loại dữ liệu...");
    const customersToInsert = [];
    const phonesToUpdateStatus = [];
    const commentsToAdd = [];

    for (const row of rows) {
      const name = row[0] || "";
      const primaryPhoneRaw = row[1]; // Cột D
      const secondaryPhoneRaw = row[2]; // Cột E
      const primaryPhone = normalizePhone(primaryPhoneRaw);

      if (!primaryPhone) continue;

      if (!existingPhones.has(primaryPhone)) {
        customersToInsert.push({
          name: name.trim(),
          phone: primaryPhone,
          status: DEFAULT_STATUS_ID,
          // ** MODIFIED: Thêm các trường mặc định theo schema
          uid: [],
          stageLevel: 0,
          comments: [],
          users: [],
          action: [],
        });
        existingPhones.add(primaryPhone);
      } else {
        phonesToUpdateStatus.push(primaryPhone);
      }

      const secondaryPhone = normalizePhone(secondaryPhoneRaw);
      if (secondaryPhone && secondaryPhone !== primaryPhone) {
        commentsToAdd.push({
          phone: primaryPhone,
          comment: {
            user: ADMIN_USER_ID,
            stage: 0,
            detail: `Số điện thoại phụ từ Sheet: ${secondaryPhone}`,
            time: new Date(),
          },
        });
      }
    }

    console.log("\n💾 Bắt đầu ghi dữ liệu vào Database...");

    if (customersToInsert.length > 0) {
      const insertResult = await Customer.insertMany(customersToInsert);
      console.log(`   -> ✅ Đã thêm mới ${insertResult.length} khách hàng.`);
    } else {
      console.log("   -> ℹ️ Không có khách hàng mới nào để thêm.");
    }

    if (phonesToUpdateStatus.length > 0) {
      const updateResult = await Customer.updateMany(
        { phone: { $in: phonesToUpdateStatus } },
        { $set: { status: DEFAULT_STATUS_ID } },
      );
      console.log(
        `   -> ✅ Đã cập nhật trạng thái cho ${updateResult.modifiedCount} khách hàng đã tồn tại.`,
      );
    } else {
      console.log("   -> ℹ️ Không có khách hàng nào cần cập nhật trạng thái.");
    }

    if (commentsToAdd.length > 0) {
      const bulkOps = commentsToAdd.map((item) => ({
        updateOne: {
          filter: { phone: item.phone },
          update: { $push: { comments: item.comment } },
        },
      }));
      const commentResult = await Customer.bulkWrite(bulkOps);
      console.log(
        `   -> ✅ Đã thêm ${commentResult.modifiedCount} ghi chú SĐT phụ.`,
      );
    } else {
      console.log("   -> ℹ️ Không có ghi chú SĐT phụ nào để thêm.");
    }

    console.log("\n🎉 Script đã thực thi thành công!");
  } catch (error) {
    console.error("\n❌ Đã xảy ra lỗi nghiêm trọng:", error);
  } finally {
    await mongoose.disconnect();
    console.log("🔌 Đã ngắt kết nối khỏi MongoDB.");
  }
}

runImport();
