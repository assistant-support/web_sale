# Tài liệu chi tiết: Chức năng tự động nhắn tin Zalo

Tài liệu mô tả từng bước, logic, database và thời gian của luồng **nhắn tin Zalo tự động hàng loạt** (chăm sóc khách hàng) trong dự án.

---

## 1. Tổng quan luồng

```
[User chọn KH + Hành động] → [Tạo ScheduledJob + Tasks] → [Lưu DB]
                                                              ↓
[Instrumentation: mỗi 30s] → [processScheduledTasks] → [Lấy 1 task đến hạn] → [Gửi tin / Tìm UID / ...] → [Cập nhật DB + Log]
```

- **Người dùng**: Chọn nhiều khách hàng trên màn Client → bấm **Hành động** → chọn loại (Gửi tin nhắn Zalo, Tìm UID, Gửi kết bạn, Kiểm tra bạn bè) → nhập nội dung (nếu có) và **số lượng/giờ** → xác nhận.
- **Server**: Tạo một **ScheduledJob** với nhiều **task**, mỗi task gắn với một khách và một thời điểm `scheduledFor` (trải đều theo số lượng/giờ).
- **Worker**: Cứ **30 giây** chạy một lần, mỗi lần chỉ lấy **1 task** đã đến hạn, xử lý (gửi tin/tìm UID/...) rồi cập nhật DB và log. Giữa các task có **sleep 3 giây** (trong cùng một lần gọi).

---

## 2. Từng bước chi tiết

### Bước 1: Người dùng mở form "Hành động"

- **Vị trí**: Trang Client (`app/client/`) → chọn nhiều khách hàng (checkbox) → bấm nút **Hành động**.
- **Component**: `app/client/ui/run/index.js` (BulkActions).
- **Dữ liệu**: Danh sách khách đã chọn được truyền dưới dạng `selectedCustomers` (Map hoặc mảng có `_id`, `name`, `phone`, `uid`, …).

### Bước 2: Chọn loại hành động và tham số

- Trong form **Hành động**:
  - **Hành động**: `sendMessage` | `findUid` | `addFriend` | `checkFriend` (hoặc Workflow / Gán người).
  - **Tên lịch trình**: `jobName` (bắt buộc).
  - **Số lượng gửi / giờ**: `actionsPerHour` (số nguyên, tối đa **30** trong code).
  - Với **Gửi tin nhắn Zalo** / **Gửi kết bạn**: thêm **Chiến dịch** (label, tùy chọn) và **Nội dung tin nhắn** (`messageTemplate`).
- Form submit → `createScheduleAction(prevState, formData)` (server action).

**File**: `app/actions/schedule.actions.js` — hàm `createScheduleAction`.

### Bước 3: Xác thực và lấy tài khoản Zalo

- Kiểm tra đăng nhập: `checkAuthToken()`.
- Kiểm tra quyền: role thuộc `Admin`, `Sale`, `Admin Sale`, `Telesale`, `Care`, `Manager`.
- Lấy user hiện tại từ DB → lấy **tài khoản Zalo đang chọn** của user: `dbUser.zalo._id` (bắt buộc phải đã chọn Zalo).
- Load **ZaloAccount** (model `zalo-account.model.js`, collection `zaloaccounts`) theo `zaloAccountId`. Nếu dùng model cũ thì có thể tham chiếu collection `zalos`.
- Chuẩn hóa danh sách khách: lấy `customerIds` từ form → query **Customer** để lấy đúng `uid` từ DB, gắn lại vào từng task (tránh client thiếu/không đồng bộ uid).

### Bước 4: Tính toán lịch từng task (schedulePersonsSmart)

- **Hàm**: `schedulePersonsSmart(persons, account, actionsPerHour, actionType, startTime?)`.
- **Ý nghĩa**: Trải đều các khách theo thời gian, tôn trọng **rate limit** (theo giờ / theo ngày) nếu account có cấu hình (model cũ); với ZaloAccount mới có thể không dùng rate limit (đặt 999/9999).
- **Công thức cơ bản**:
  - `baseIntervalMs = 3600000 / actionsPerHour` (ms giữa hai lần gửi trong 1 giờ).
  - Với mỗi người: `scheduledFor = currentTime + jitter` (jitter ngẫu nhiên nhỏ để tránh gửi đều đặn máy móc).
  - Nếu có rate limit theo giờ/ngày: khi vượt `rateLimitPerHour` / `rateLimitPerDay` thì đẩy `currentTime` sang giờ tiếp theo hoặc ngày tiếp theo.
- **Kết quả**:
  - `scheduledTasks`: mảng `{ person: { name, phone, uid, _id, type }, scheduledFor, status: false }`.
  - `estimatedCompletion`: thời điểm ước tính hoàn thành cả lô.
  - `finalCounters`: dùng để cập nhật `ZaloAccount` (rate limit đã “dùng”).

### Bước 5: Lưu ScheduledJob vào MongoDB

- **Model**: `models/schedule.js` → collection mặc định **`scheduledjobs`** (tên model `scheduledjob`).
- **Document**:
  - `jobName`, `actionType`, `zaloAccount` (ObjectId ref),
  - `config`: `messageTemplate`, `actionsPerHour`,
  - `tasks`: mảng task (mỗi task: `person`, `history`, `status`, `scheduledFor`),
  - `statistics`: `total`, `completed`, `failed`,
  - `createdBy`, `estimatedCompletionTime` (được set khi tạo),
  - `isManualAction` (mặc định true).
- **Index**: `{ 'tasks.status': 1, 'tasks.scheduledFor': 1 }` để worker truy vấn task đến hạn nhanh.
- Sau khi tạo job: cập nhật **ZaloAccount** (push `action: newJob._id`), gọi `revalidateData()` và `reloadRunningSchedules()` để UI cập nhật.

### Bước 6: Worker chạy định kỳ (Instrumentation)

- **File**: `instrumentation.ts` (chỉ chạy khi `NEXT_RUNTIME === 'nodejs'`).
- Khi server khởi động:
  - Gọi `startZaloActionScheduler()`.
  - Lần đầu gọi ngay `triggerScheduler()`.
  - Sau đó **setInterval(..., 30000)** → mỗi **30 giây** gọi `triggerScheduler()` một lần.
- `triggerScheduler()`: dynamic import `processScheduledTasks` từ `app/api/(zalo)/action/route.js` rồi gọi. Lỗi chỉ log, không làm crash server.

### Bước 7: Lấy một task đến hạn (processScheduledTasks)

- **File**: `app/api/(zalo)/action/route.js` — hàm `processScheduledTasks()`.
- **Thời điểm “đến hạn”**: `tasks.scheduledFor <= now + 1 phút` (trong code: `oneMinuteLater = now + 60*1000`), và `tasks.status === false`.
- **Truy vấn**: Aggregate trên collection `scheduledjobs`:
  - `$match`: có task chưa xong và `scheduledFor <= oneMinuteLater`,
  - `$unwind: '$tasks'`,
  - `$match` lại trên task,
  - `$lookup` sang `zaloaccounts` và `zalos` để lấy thông tin tài khoản Zalo,
  - `$sort`: `tasks.scheduledFor` tăng dần,
  - **`$limit: 1`** → mỗi lần chỉ lấy **đúng 1 task**.
- Nếu không có task nào thỏa mãn → return `count: 0`.
- Nếu có: format `zaloAccount` (ưu tiên ZaloAccount mới từ `zaloaccounts`), rồi **đánh dấu task đã lấy** để tránh worker khác (hoặc lần sau) xử lý trùng:
  - `ScheduledJob.updateOne(..., { $set: { 'tasks.$.status': true } })`.

### Bước 8: Xử lý một task (processSingleTask)

- **Input**: `taskDetail` = { job, task, zaloAccount }.
- **Chung**:
  - Lấy **Customer** theo `task.person._id`.
  - Resolve **accountKey** từ `zaloAccount` (ZaloAccount mới có `accountKey`; cũ thì tra trong `zaloaccounts` theo uid/zaloId).
- **Với sendMessage / addFriend / checkFriend**: Nếu khách chưa có UID thì gọi `findUserUid(accountKey, phone)` từ `data/zalo/chat.actions.js` (zca-js), rồi lưu UID vào **Customer** (push vào `customer.uid`).
- **sendMessage**: `formatMessage(messageTemplate, targetDoc, zaloAccount)` (thay `{name}`, variant...) → `sendUserMessage(accountKey, uidPerson, text, attachments)`.
- **addFriend**: `sendFriendRequest(accountKey, uidPerson, msg)`.
- **checkFriend**: `getFriendRequestStatus(accountKey, uidPerson)`.
- **findUid**: Chỉ tìm UID (findUserUid) rồi lưu vào Customer.
- Sau khi gọi API:
  - Tạo bản ghi **Log** (model `logmes`): type = actionType, customer, zalo, status (kết quả), message.
  - Cập nhật **Customer**: pipelineStatus (ví dụ `msg_success_2` / `msg_error_2`), push vào `care` (lịch sử chăm sóc).
  - Cập nhật **ScheduledJob**: `statistics.completed` hoặc `statistics.failed`, task `history` = ObjectId log. Nếu job hoàn thành (completed + failed >= total) thì pull job khỏi `ZaloAccount.action`.
- **Retry**: Nếu lỗi rate limit hoặc session (cookie/session): `retryable + retryDelayMs` → set lại `tasks.$.status: false` và `tasks.$.scheduledFor = now + retryDelayMs` (5 phút hoặc 15 phút tùy lỗi).
- **Sleep**: Sau mỗi task (dù thành công hay retry), `await new Promise(r => setTimeout(r, SLEEP_AFTER_TASK_MS))` với **SLEEP_AFTER_TASK_MS = 3000** (3 giây).

### Bước 9: Gửi tin thực tế (zca-js)

- **File**: `data/zalo/chat.actions.js`.
- **ensureZaloApi(accountKey)**: Nếu chưa có phiên trong `globalThis.__zalo_api_registry` thì đọc **ZaloAccount** từ MongoDB (session.cookies, device.imei, device.userAgent) và login bằng cookie (zca-js). Sau đó lưu api vào registry.
- **sendUserMessage({ accountKey, userId, text, attachments })**: Lấy api từ registry → `api.sendMessage(payload, userId, ThreadType.User)`.
- **findUserUid({ accountKey, phoneOrUid })**: `api.findUser(phone)` hoặc `api.getUserInfo(uid)`.

---

## 3. Logic chính

### 3.1 Phân bổ thời gian (schedulePersonsSmart)

- **actionsPerHour** (tối đa 30): số hành động mỗi giờ → khoảng cách cơ bản = `3600000 / actionsPerHour` ms.
- **Jitter**: thêm nhiễu ngẫu nhiên (±15% khoảng cách) để tránh gửi đều đặn từng phút.
- **Rate limit (nếu có)**:
  - Theo giờ: không vượt `rateLimitPerHour` trong cùng một giờ (tính từ `rateLimitHourStart`).
  - Theo ngày: không vượt `rateLimitPerDay` trong cùng một ngày.
  - Khi vượt → đẩy `currentTime` sang giờ/ngày mới rồi mới gán `scheduledFor`.

### 3.2 Worker “một task mỗi lần”

- Mỗi lần `processScheduledTasks()` chỉ lấy **1** task (`$limit: 1`), xử lý xong rồi return. Chu kỳ 30 giây sau sẽ chạy lại và lấy task tiếp theo.  
→ **Không** gửi cùng lúc nhiều tin trong một request; toàn bộ là **tuần tự** theo thời gian đã lên lịch.

### 3.3 Retry khi lỗi

- **Rate limit (429, …)**: retry sau **5 phút** (RETRY_DELAY_RATE_MS).
- **Session/cookie (401, 403, login, …)**: retry sau **15 phút** (RETRY_DELAY_SESSION_MS).
- Cách làm: set lại `tasks.$.status = false` và `tasks.$.scheduledFor = now + retryDelayMs`, không tăng `statistics.failed` cho đến khi bỏ retry.

### 3.4 Template tin nhắn

- **formatMessage** (trong route hoặc dùng chung): thay `{name}`, `{nameparent}`, `{namezalo}`; biến variant lấy từ collection **variants** (random một phrase theo tên biến).

---

## 4. Database: lưu gì và truy cập thế nào

### 4.1 Collection / Model liên quan

| Collection (MongoDB) | Model (file) | Vai trò |
|---------------------|-------------|--------|
| **scheduledjobs**   | `models/schedule.js` (ScheduledJob) | Lịch gửi: job + danh sách tasks, mỗi task có `scheduledFor`, `status`, `person`. |
| **zaloaccounts**    | `models/zalo-account.model.js` (ZaloAccount) | Tài khoản Zalo (accountKey, profile, device, session.cookies). |
| **zalos**           | (model cũ) | Tài khoản Zalo cũ; worker vẫn hỗ trợ lookup. |
| **customers**       | Customer | Khách hàng: uid (mảng), pipelineStatus, care; được cập nhật sau mỗi task. |
| **logmes**          | `models/log.model.js` (Logs) | Log từng lần gửi tin/tìm UID/kết bạn: type, customer, zalo, status. |
| **users**           | User | User chọn Zalo (user.zalo = ObjectId ZaloAccount); createdBy của job. |
| **variants**        | Variant | Biến thay thế trong template (e.g. `{ten_bien}`). |

### 4.2 Cách lưu và truy cập

**Khi tạo lịch (createScheduleAction):**

- **Đọc**: User (theo token), ZaloAccount (theo user.zalo), Customer (theo danh sách id để lấy uid).
- **Ghi**:  
  - **ScheduledJob**: insert một document (jobName, actionType, zaloAccount, config, tasks, statistics, createdBy, estimatedCompletionTime).  
  - **ZaloAccount**: `$push: { action: newJob._id }`.

**Khi worker chạy (processScheduledTasks + processSingleTask):**

- **Đọc**:
  - Aggregate trên **scheduledjobs**: match task `status: false`, `scheduledFor <= oneMinuteLater`, sort by `scheduledFor`, limit 1; lookup **zaloaccounts** và **zalos** để lấy account.
  - **Customer**: findById(task.person._id) để lấy thông tin và uid.
  - **ZaloAccount**: để lấy accountKey (và session nếu cần ensureZaloApi).
- **Ghi**:
  - **ScheduledJob**:  
    - Đánh dấu task: `tasks.$.status = true` (ngay khi lấy task).  
    - Sau xử lý: `$inc: statistics.completed` hoặc `statistics.failed`, `tasks.$.history = logId`.  
    - Nếu retry: `tasks.$.status = false`, `tasks.$.scheduledFor = now + delay`.
  - **Customer**:  
    - Cập nhật `uid` (nếu vừa tìm UID), `pipelineStatus`, `$push: care`.
  - **Logs (logmes)**: insert một document (type, customer, zalo, createBy, status).
  - **ZaloAccount**: Khi job kết thúc (completed + failed >= total): `$pull: { action: jobId }`.

**Index quan trọng:**

- `scheduledjobs`: `{ 'tasks.status': 1, 'tasks.scheduledFor': 1 }` — dùng cho truy vấn “một task đến hạn”.

---

## 5. Thời gian (timing)

| Tham số | Giá trị | Ý nghĩa |
|--------|---------|--------|
| **Chu kỳ worker** | **30 giây** | Mỗi 30s gọi `processScheduledTasks()` một lần (setInterval trong instrumentation). |
| **SLEEP_AFTER_TASK_MS** | **3 giây** | Sau mỗi task (trong một lần gọi) sleep 3s rồi mới return. |
| **actionsPerHour** | 1–**30** | Số task/giờ khi tạo lịch; cap trong code là 30. |
| **baseIntervalMs** | 3600000 / actionsPerHour | Khoảng cách cơ bản (ms) giữa hai task (ví dụ 30/giờ → 120000 ms = 2 phút). |
| **oneMinuteLater** | now + 60*1000 | Task có `scheduledFor` trong vòng 1 phút tới vẫn được coi là “đến hạn”. |
| **Retry rate limit** | 5 phút | Khi lỗi rate limit, đặt lại scheduledFor = now + 5 phút. |
| **Retry session** | 15 phút | Khi lỗi session/cookie, đặt lại scheduledFor = now + 15 phút. |

**Ví dụ thời gian:**

- 60 khách, 30 actions/giờ → khoảng 2 giờ (task đầu ngay sau “bây giờ”, task cuối ~2h sau).
- Worker: tối đa 1 task mỗi 30 giây (và mỗi task thêm 3s sleep trong request) → thực tế throughput bị giới hạn bởi “1 task / 30s” và bởi chính lịch đã trải đều theo actionsPerHour.

---

## 6. Tóm tắt luồng dữ liệu và file chính

- **UI**: `app/client/ui/run/index.js` (BulkActions, form Hành động).
- **Tạo lịch**: `app/actions/schedule.actions.js` (createScheduleAction, schedulePersonsSmart).
- **Model lịch**: `models/schedule.js` (ScheduledJob, Task).
- **Worker**: `instrumentation.ts` (startZaloActionScheduler, 30s) → `app/api/(zalo)/action/route.js` (processScheduledTasks, processSingleTask).
- **Gửi tin / Zalo**: `data/zalo/chat.actions.js` (ensureZaloApi, sendUserMessage, findUserUid,…).
- **Tài khoản Zalo**: `models/zalo-account.model.js` (ZaloAccount, session, device).
- **Log**: `models/log.model.js` (logmes).

Toàn bộ luồng tự động nhắn tin Zalo hàng loạt: **từ bước chọn khách và tạo lịch → lưu DB → worker chạy mỗi 30 giây, mỗi lần 1 task → gửi tin/tìm UID/… qua zca-js → cập nhật Customer và Log** đều đi theo các bước và database mô tả ở trên.

---

## 7. Trigger thủ công (testing / cron ngoài)

- **GET** endpoint trong `app/api/(zalo)/action/route.js`: khi gọi GET (URL tùy cấu trúc route của app, ví dụ `/api/.../action`) sẽ chạy `processScheduledTasks()` một lần.
- Response: `{ message, count }` (count = 0 hoặc 1); status 202 nếu đã xử lý task, 200 nếu không có task.
- Có thể dùng để test hoặc gọi từ cron/tool bên ngoài thay vì chỉ dựa vào setInterval 30 giây trong instrumentation.
