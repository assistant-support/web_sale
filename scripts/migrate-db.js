const mongoose = require("mongoose");
// Đảm bảo file .env.local của bạn có biến MongoDB_URI
require("dotenv").config({ path: ".env" });

const ScheduledJob =
  mongoose.models.scheduledjob ||
  mongoose.model("scheduledjob", new mongoose.Schema({}, { strict: false }));

const ArchivedJob =
  mongoose.models.archivedjob ||
  mongoose.model("archivedjob", new mongoose.Schema({}, { strict: false }));

const Customer =
  mongoose.models.customer ||
  mongoose.model("customer", new mongoose.Schema({}, { strict: false }));

// --- START: Định nghĩa Schema cho các collection cần di trú ---

const ZaloAccountSchema = new mongoose.Schema(
  {
    rateLimitPerHour: { type: Number, default: 30 },
    actionsUsedThisHour: { type: Number, default: 0 },
    rateLimitHourStart: { type: Date, default: () => new Date() },
    rateLimitPerDay: { type: Number, default: 200 },
    actionsUsedThisDay: { type: Number, default: 0 },
    rateLimitDayStart: { type: Date, default: () => new Date() },
    isLocked: { type: Boolean, default: false },
  },
  { strict: false }, // Dùng strict: false để Mongoose không báo lỗi với các trường đã có sẵn
);

const StatusSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, unique: true },
    description: { type: String },
  },
  { strict: false },
);
const ActionHistorySchema = new mongoose.Schema(
  {
    "actionDetail.scheduleId": { type: mongoose.Schema.Types.Mixed }, // Cho phép đọc cả String và ObjectId
  },
  { strict: false },
);
// --- END: Định nghĩa Schema ---

// --- START: Khai báo Models ---
// ** MODIFIED: Thêm khai báo model User
const User =
  mongoose.models.user ||
  mongoose.model("user", new mongoose.Schema({}, { strict: false }));

const ZaloAccount =
  mongoose.models.zaloaccount ||
  mongoose.model("zaloaccount", ZaloAccountSchema);

const Status = mongoose.models.status || mongoose.model("status", StatusSchema);
const ActionHistory =
  mongoose.models.actionhistory ||
  mongoose.model("actionhistory", ActionHistorySchema);
// --- END: Khai báo Models ---

async function migrateCustomerUids() {
  console.log("\n--- BẮT ĐẦU DI TRÚ & LÀM SẠCH DỮ LIỆU UID KHÁCH HÀNG ---");

  // --- Bước 1: Làm sạch các khách hàng có uid: null ---
  const nullUidQuery = { uid: null };
  const nullCount = await Customer.countDocuments(nullUidQuery);
  if (nullCount > 0) {
    console.log(
      `🔍 Tìm thấy ${nullCount} khách hàng có uid: null. Đang sửa...`,
    );
    const result = await Customer.updateMany(nullUidQuery, {
      $set: { uid: [] },
    });
    console.log(`✨ Đã sửa thành công ${result.modifiedCount} khách hàng.`);
  } else {
    console.log("✅ Không có khách hàng nào có uid: null.");
  }

  // --- Bước 2: Di trú các khách hàng có uid là string ---
  const stringUidQuery = { uid: { $type: "string", $ne: "" } };
  const customersToMigrate = await Customer.find(stringUidQuery).lean();

  if (customersToMigrate.length === 0) {
    console.log("✅ Không tìm thấy khách hàng nào có UID cũ cần di trú.");
    return;
  }

  console.log(
    `🔍 Tìm thấy ${customersToMigrate.length} khách hàng cần di trú UID...`,
  );

  const customerIds = customersToMigrate.map((c) => c._id);

  // 2. Tìm tất cả lịch sử tìm UID liên quan đến các khách hàng này
  const histories = await ActionHistory.find({
    customer: { $in: customerIds },
    action: "DO_SCHEDULE_FIND_UID",
    "status.status": "SUCCESS",
  })
    .sort({ time: -1 })
    .lean();

  // 3. Tạo một map để tra cứu lịch sử nhanh: Map<customerId, history>
  const historyMap = new Map();
  for (const history of histories) {
    const customerId = history.customer.toString();
    // Chỉ lưu lịch sử gần nhất cho mỗi khách hàng
    if (!historyMap.has(customerId)) {
      historyMap.set(customerId, history);
    }
  }

  // 4. Chuẩn bị các lệnh cập nhật hàng loạt (bulk write)
  const bulkOperations = customersToMigrate.map((customer) => {
    const latestHistory = historyMap.get(customer._id.toString());
    if (latestHistory && latestHistory.zalo) {
      const newUidArray = [{ zaloId: latestHistory.zalo, uid: customer.uid }];
      return {
        updateOne: {
          filter: { _id: customer._id },
          update: { $set: { uid: newUidArray } },
        },
      };
    } else {
      return {
        updateOne: {
          filter: { _id: customer._id },
          update: { $set: { uid: [] } },
        },
      };
    }
  });

  // 5. Thực thi các lệnh cập nhật
  if (bulkOperations.length > 0) {
    const result = await Customer.bulkWrite(bulkOperations);
    console.log(
      `✨ Di trú thành công ${result.modifiedCount} bản ghi khách hàng!`,
    );
  }
}

/**
 * Logic để di trú dữ liệu cho collection 'zaloaccounts'.
 * Thêm các trường còn thiếu và sửa các giá trị mặc định bị sai.
 */
async function migrateZaloAccounts() {
  console.log("\n--- BẮT ĐẦU DI TRÚ TÀI KHOẢN ZALO ---");

  // Logic cũ để tìm và sửa các tài khoản Zalo
  const query = {
    $or: [
      { rateLimitPerDay: { $exists: false } },
      { actionsUsedThisDay: { $exists: false } },
      { rateLimitDayStart: { $exists: false } },
    ],
  };
  const count = await ZaloAccount.countDocuments(query);

  if (count === 0) {
    console.log(
      "✅ Tất cả các tài khoản Zalo đã được đồng bộ. Không cần di trú.",
    );
    return;
  }

  console.log(`🔍 Tìm thấy ${count} tài khoản Zalo cần được cập nhật...`);
  const updateOperation = {
    $set: {
      rateLimitPerDay: 200,
      actionsUsedThisDay: 0,
      rateLimitDayStart: new Date(),
    },
  };
  const result = await ZaloAccount.updateMany(query, updateOperation);
  console.log(`✨ Cập nhật thành công ${result.modifiedCount} tài khoản Zalo!`);
}

/**
 * Logic để di trú dữ liệu cho collection 'statuses'.
 * Tự động định dạng lại tên các trạng thái theo chuẩn QTxx| <tên>.
 */
// ** MODIFIED: Cập nhật toàn bộ hàm migrateStatuses
async function migrateStatuses() {
  console.log("\n--- BẮT ĐẦU DI TRÚ TRẠNG THÁI ---");

  // Bước 1: Tìm tất cả các trạng thái CHƯA có định dạng chuẩn (QTxx|)
  const statusesToMigrate = await Status.find({
    name: { $not: /^QT\d+\|/ },
  }).lean();

  if (statusesToMigrate.length === 0) {
    console.log("✅ Không có trạng thái nào cần di trú. Dữ liệu đã chuẩn.");
    return;
  }

  console.log(
    `🔍 Tìm thấy ${statusesToMigrate.length} trạng thái cần xử lý...`,
  );

  // Bước 2: Tìm số thứ tự QT lớn nhất đã tồn tại trong DB (để đánh số cho các trạng thái mới)
  const allStatuses = await Status.find({ name: /^QT\d+\|/ }).lean();
  let maxOrder = 0;
  allStatuses.forEach((status) => {
    const match = status.name.match(/^QT(\d+)\|/);
    if (match) {
      const order = parseInt(match[1], 10);
      if (order > maxOrder) {
        maxOrder = order;
      }
    }
  });

  console.log(`📈 Số thứ tự QT lớn nhất hiện tại là: ${maxOrder}`);

  // Bước 3: Chuẩn bị các lệnh cập nhật hàng loạt
  const bulkOperations = statusesToMigrate.map((status) => {
    let newName = "";
    const oldName = status.name.trim();

    // Regex để tìm định dạng cũ, ví dụ: "QT1: Ten trang thai"
    const oldFormatMatch = oldName.match(/^QT(\d+):\s*(.*)/);

    if (oldFormatMatch) {
      // TRƯỜNG HỢP 1: Chuyển đổi từ định dạng cũ
      const orderNumber = parseInt(oldFormatMatch[1], 10);
      const cleanName = oldFormatMatch[2].trim();

      // Đảm bảo số thứ tự luôn có 2 chữ số (01, 02, ..., 11)
      const paddedOrder = String(orderNumber).padStart(2, "0");
      newName = `QT${paddedOrder}| ${cleanName}`;

      console.log(`  -> CHUYỂN ĐỔI: "${oldName}"  ==>  "${newName}"`);
    } else {
      // TRƯỜNG HỢP 2: Thêm mới tiền tố cho trạng thái chưa có
      maxOrder++; // Tăng số thứ tự lên cho trạng thái mới
      const paddedOrder = String(maxOrder).padStart(2, "0");
      newName = `QT${paddedOrder}| ${oldName}`;

      console.log(`  -> THÊM MỚI:   "${oldName}"  ==>  "${newName}"`);
    }

    return {
      updateOne: {
        filter: { _id: status._id },
        update: { $set: { name: newName } },
      },
    };
  });

  // Bước 4: Thực thi lệnh
  if (bulkOperations.length > 0) {
    const result = await Status.bulkWrite(bulkOperations);
    console.log(`✨ Cập nhật thành công ${result.modifiedCount} trạng thái!`);
  }
}

async function migrateScheduleIds() {
  console.log("\n--- BẮT ĐẦU DI TRÚ SCHEDULE ID ---");
  // Tìm tất cả các bản ghi có actionDetail.scheduleId là kiểu STRING
  const query = { "actionDetail.scheduleId": { $type: "string" } };

  const historiesToMigrate = await ActionHistory.find(query).lean();

  if (historiesToMigrate.length === 0) {
    console.log("✅ Không có scheduleId nào cần di trú. Dữ liệu đã chuẩn.");
    return;
  }

  console.log(
    `🔍 Tìm thấy ${historiesToMigrate.length} bản ghi lịch sử cần chuyển đổi scheduleId...`,
  );

  const bulkOperations = historiesToMigrate
    .map((history) => {
      // Chỉ thực hiện nếu chuỗi là một ObjectId hợp lệ
      if (mongoose.Types.ObjectId.isValid(history.actionDetail.scheduleId)) {
        return {
          updateOne: {
            filter: { _id: history._id },
            update: {
              $set: {
                "actionDetail.scheduleId": new mongoose.Types.ObjectId(
                  history.actionDetail.scheduleId,
                ),
              },
            },
          },
        };
      }
      return null; // Bỏ qua các chuỗi không hợp lệ
    })
    .filter(Boolean); // Lọc ra các giá trị null

  if (bulkOperations.length > 0) {
    const result = await ActionHistory.bulkWrite(bulkOperations);
    console.log(
      `✨ Chuyển đổi thành công ${result.modifiedCount} scheduleId từ String sang ObjectId!`,
    );
  } else {
    console.log("✅ Không có scheduleId hợp lệ nào để chuyển đổi.");
  }
}

/**
 * @description Sửa lỗi gán sai scheduleId cho các action DO_... bằng cách
 * đối chiếu với action CREATE_... gần nhất của cùng một khách hàng.
 */
async function fixMismatchedHistoryIds() {
  console.log("\n--- BẮT ĐẦU SỬA LỖI GÁN SAI SCHEDULE ID ---");

  // 1. Tìm tất cả các hành động DO_... để kiểm tra
  const doActions = await ActionHistory.find({ action: /^DO_/ }).lean();

  if (doActions.length === 0) {
    console.log("✅ Không tìm thấy hành động DO_... nào để kiểm tra.");
    return;
  }

  // 2. Lấy tất cả các hành động CREATE_... để tra cứu
  const createActions = await ActionHistory.find({ action: /^CREATE_/ }).lean();
  const createActionsMap = new Map();
  // Tạo một map lồng nhau để tra cứu nhanh: Map<customerId, Array<createAction>>
  for (const action of createActions) {
    if (!action.customer) continue;
    const customerId = action.customer.toString();
    if (!createActionsMap.has(customerId)) {
      createActionsMap.set(customerId, []);
    }
    createActionsMap.get(customerId).push(action);
  }

  // Sắp xếp các hành động CREATE của mỗi khách hàng theo thời gian giảm dần
  for (const actions of createActionsMap.values()) {
    actions.sort((a, b) => new Date(b.time) - new Date(a.time));
  }

  console.log(
    `🔍 Tìm thấy ${doActions.length} hành động DO_... để kiểm tra và sửa chữa.`,
  );

  const bulkOperations = [];
  let updatedCount = 0;

  for (const doAction of doActions) {
    if (!doAction.customer) continue;

    const customerId = doAction.customer.toString();
    const doActionTime = new Date(doAction.time);
    const potentialCreateActions = createActionsMap.get(customerId);

    if (potentialCreateActions) {
      // 3. Tìm hành động CREATE gần nhất xảy ra TRƯỚC hành động DO
      const correctCreateAction = potentialCreateActions.find(
        (createAction) => new Date(createAction.time) < doActionTime,
      );

      if (correctCreateAction && correctCreateAction.actionDetail.scheduleId) {
        const correctId = correctCreateAction.actionDetail.scheduleId;
        const currentId = doAction.actionDetail.scheduleId?.toString();

        // 4. Chỉ cập nhật nếu ID hiện tại đang thiếu hoặc bị sai
        if (!currentId || currentId !== correctId.toString()) {
          bulkOperations.push({
            updateOne: {
              filter: { _id: doAction._id },
              update: { $set: { "actionDetail.scheduleId": correctId } },
            },
          });
          updatedCount++;
        }
      }
    }
  }

  if (bulkOperations.length > 0) {
    await ActionHistory.bulkWrite(bulkOperations);
    console.log(
      `✨ Sửa chữa và cập nhật thành công ${updatedCount} liên kết lịch sử.`,
    );
  } else {
    console.log("✅ Không tìm thấy liên kết lịch sử nào cần sửa chữa.");
  }
}

// ++ ADDED: Hàm di trú và dọn dẹp các job bị treo
async function migrateAndCleanupHungJobs() {
  console.log(
    "\n--- BẮT ĐẦU DI TRÚ & DỌN DẸP JOB BỊ TREO (PHIÊN BẢN HOÀN THIỆN) ---",
  );

  // --- Bước 1: Quét và thu thập dữ liệu từ các job bị treo ---
  const hungJobs = await ScheduledJob.find({}).lean();

  if (hungJobs.length === 0) {
    console.log("✅ Không tìm thấy job nào bị treo trong 'scheduledjobs'.");
    return;
  }

  console.log(`🔍 Tìm thấy ${hungJobs.length} job bị treo cần xử lý...`);

  const jobsToArchive = [];
  const allHungJobIds = hungJobs.map((job) => job._id);

  // --- Bước 2: Tính toán lại Thông số & Chuẩn bị Di trú ---
  for (const job of hungJobs) {
    console.log(`  -> Đang xử lý Job: "${job.jobName}" (${job._id})`);

    const stats = job.statistics || { total: 0, completed: 0, failed: 0 };

    // Đếm số task chưa hoàn thành (bị treo)
    const pendingOrProcessingTasks = (job.tasks || []).filter(
      (task) => task.status === "pending" || task.status === "processing",
    ).length;

    // Tính toán lại thống kê một cách chính xác
    const recalculatedStats = {
      total: stats.total || (job.tasks || []).length,
      completed: stats.completed || 0,
      // **LOGIC CHUẨN**: failed mới = failed cũ + số lượng bị treo
      failed: (stats.failed || 0) + pendingOrProcessingTasks,
    };

    const archiveData = {
      ...job,
      _id: job._id,
      status: "failed", // Coi như toàn bộ job đã thất bại do bị dừng
      statistics: recalculatedStats,
      completedAt: new Date(),
    };
    delete archiveData.tasks;

    jobsToArchive.push(archiveData);
    console.log(
      `     - Thống kê cũ:      Completed: ${stats.completed}, Failed: ${stats.failed}`,
    );
    console.log(`     - Task bị treo:     ${pendingOrProcessingTasks}`);
    console.log(
      `     - Thống kê MỚI:     Completed: ${recalculatedStats.completed}, Failed: ${recalculatedStats.failed}`,
    );
  }

  // --- Bước 3: Dọn dẹp và Di trú ---
  const session = await mongoose.startSession();
  try {
    session.startTransaction();
    console.log("\n🔄 Bắt đầu giao dịch di trú và dọn dẹp...");

    // 1. Di trú các job đã chuẩn hóa
    if (jobsToArchive.length > 0) {
      await ArchivedJob.insertMany(jobsToArchive, { session });
      console.log(
        `  [1/3] ✅ Đã di trú ${jobsToArchive.length} job sang 'archivedjobs'.`,
      );
    }

    // 2. **LOGIC CHUẨN**: Dọn dẹp TOÀN BỘ tham chiếu action liên quan đến các job bị treo
    const customerUpdateResult = await Customer.updateMany(
      { "action.job": { $in: allHungJobIds } }, // Tìm tất cả customer có action liên quan
      { $pull: { action: { job: { $in: allHungJobIds } } } },
      { session },
    );
    console.log(
      `  [2/3] ✅ Đã dọn dẹp tham chiếu 'action' cho ${customerUpdateResult.modifiedCount} khách hàng.`,
    );

    // 3. Xóa các job gốc
    const deleteResult = await ScheduledJob.deleteMany(
      { _id: { $in: allHungJobIds } },
      { session },
    );
    console.log(
      `  [3/3] ✅ Đã xóa ${deleteResult.deletedCount} job gốc khỏi 'scheduledjobs'.`,
    );

    await session.commitTransaction();
    console.log("\n✨ Giao dịch hoàn tất! Dữ liệu đã được xử lý chính xác.");
  } catch (error) {
    await session.abortTransaction();
    console.error(
      "\n❌ Đã xảy ra lỗi trong giao dịch! Dữ liệu đã được khôi phục.",
      error,
    );
  } finally {
    session.endSession();
  }
}

/**
 * @description Chuẩn hóa lại các SĐT trong collection 'zaloaccounts' từ dạng +84/84 sang dạng 0.
 */
async function migrateZaloPhoneNumbers() {
  console.log("\n--- BẮT ĐẦU CHUẨN HÓA SỐ ĐIỆN THOẠI ZALO ---");
  const accountsToFix = await ZaloAccount.find({
    $or: [{ phone: /^\+84/ }, { phone: /^84/ }],
  }).lean();

  if (accountsToFix.length === 0) {
    console.log("✅ Không có SĐT tài khoản Zalo nào cần chuẩn hóa.");
    return;
  }
  console.log(
    `🔍 Tìm thấy ${accountsToFix.length} tài khoản Zalo cần chuẩn hóa SĐT.`,
  );

  const bulkOps = accountsToFix.map((account) => {
    let newPhone = account.phone;
    if (newPhone.startsWith("+84")) {
      newPhone = "0" + newPhone.substring(3);
    } else if (newPhone.startsWith("84")) {
      newPhone = "0" + newPhone.substring(2);
    }
    return {
      updateOne: {
        filter: { _id: account._id },
        update: { $set: { phone: newPhone } },
      },
    };
  });

  const result = await ZaloAccount.bulkWrite(bulkOps);
  console.log(
    `✨ Chuẩn hóa thành công ${result.modifiedCount} số điện thoại Zalo.`,
  );
}

/**
 * @description Đặt lại rate limit cho TẤT CẢ các tài khoản Zalo về giá trị chuẩn: 30/giờ và 200/ngày.
 */
async function standardizeZaloLimits() {
  console.log("\n--- BẮT ĐẦU CHUẨN HÓA GIỚI HẠN TÀI KHOẢN ZALO ---");

  // Tìm tất cả các tài khoản không có giới hạn chuẩn
  const query = {
    $or: [{ rateLimitPerHour: { $ne: 30 } }, { rateLimitPerDay: { $ne: 200 } }],
  };
  const accountsToFix = await ZaloAccount.find(query).lean();

  if (accountsToFix.length === 0) {
    console.log("✅ Tất cả tài khoản Zalo đã có giới hạn chuẩn.");
    return;
  }

  console.log(
    `🔍 Tìm thấy ${accountsToFix.length} tài khoản Zalo cần chuẩn hóa giới hạn.`,
  );

  const result = await ZaloAccount.updateMany(query, {
    $set: {
      rateLimitPerHour: 30,
      rateLimitPerDay: 200,
    },
  });

  console.log(
    `✨ Chuẩn hóa thành công giới hạn cho ${result.modifiedCount} tài khoản.`,
  );
}
/**
 * @description Tìm tất cả user có role 'Teacher' và cập nhật thành 'Employee'.
 */
async function migrateUserRoles() {
  console.log("\n--- BẮT ĐẦU CHUẨN HÓA VAI TRÒ USER ---");
  const query = { role: "Teacher" };
  const usersToFix = await User.find(query).lean();

  if (usersToFix.length === 0) {
    console.log("✅ Không có user nào có vai trò 'Teacher'. Dữ liệu đã chuẩn.");
    return;
  }
  console.log(`🔍 Tìm thấy ${usersToFix.length} user cần chuẩn hóa vai trò.`);

  const result = await User.updateMany(query, {
    $set: { role: "Employee" },
  });

  console.log(
    `✨ Chuẩn hóa thành công vai trò cho ${result.modifiedCount} user.`,
  );
}

/**
 * @description Quét và thêm trường `isTokenActive: true` cho các tài khoản Zalo còn thiếu.
 */
async function addIsTokenActiveField() {
  console.log("\n--- BẮT ĐẦU THÊM TRƯỜNG isTokenActive ---");
  const query = { isTokenActive: { $exists: false } };
  const accountsToUpdate = await ZaloAccount.countDocuments(query);

  if (accountsToUpdate === 0) {
    console.log("✅ Tất cả tài khoản Zalo đã có trường isTokenActive.");
    return;
  }

  console.log(
    `🔍 Tìm thấy ${accountsToUpdate} tài khoản cần thêm trường isTokenActive.`,
  );

  const result = await ZaloAccount.updateMany(query, {
    $set: { isTokenActive: true },
  });

  console.log(
    `✨ Thêm trường isTokenActive thành công cho ${result.modifiedCount} tài khoản.`,
  );
}

async function cleanupNullUids() {
  console.log("\n--- BẮT ĐẦU LÀM SẠCH DỮ LIỆU UID BỊ NULL ---");

  // 1. Tìm tất cả các customer có uid là null
  const query = { uid: null };
  const customersToFix = await Customer.find(query).lean();

  if (customersToFix.length === 0) {
    console.log("✅ Không tìm thấy khách hàng nào có uid: null. Dữ liệu sạch!");
    return;
  }

  console.log(
    `🔍 Tìm thấy ${customersToFix.length} khách hàng có uid: null cần sửa...`,
  );

  // 2. Cập nhật tất cả các document tìm thấy, đặt uid thành mảng rỗng
  const result = await Customer.updateMany(query, { $set: { uid: [] } });

  console.log(`✨ Đã cập nhật thành công ${result.modifiedCount} khách hàng!`);
}

/**
 * Hàm chính để chạy toàn bộ quá trình di trú.
 */
async function runMigration() {
  const mongoURI = process.env.MongoDB_URI;
  if (!mongoURI) {
    console.error("❌ Lỗi: Biến môi trường 'MongoDB_URI' chưa được thiết lập.");
    return;
  }

  try {
    console.log("🔄 Đang kết nối đến MongoDB...");
    await mongoose.connect(mongoURI);
    console.log("✅ Kết nối thành công!");
    // await addIsTokenActiveField();
    // await migrateZaloAccounts();
    // await migrateZaloPhoneNumbers();
    // await standardizeZaloLimits();
    // await migrateScheduleIds();
    await fixMismatchedHistoryIds();
    // await migrateAndCleanupHungJobs(); !!!
    await migrateCustomerUids();
    // await migrateUserRoles();
    // await migrateStatuses();
    // await cleanupNullUids();
  } catch (error) {
    console.error("❌ Đã xảy ra lỗi trong quá trình di trú:", error);
  } finally {
    await mongoose.disconnect();
    console.log("🔌 Đã ngắt kết nối khỏi MongoDB.");
  }
}

// Chạy hàm di trú chính
// runMigration();
