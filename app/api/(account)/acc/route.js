import { NextResponse } from "next/server";
import { google } from "googleapis";
import connectToDatabase from "@/config/connectDB";
import ZaloAccount from "@/models/zalo";
import "@/models/users";
import { Re_acc, Re_user } from "@/data/users";

const APPS_SCRIPT_URL =
  "https://script.google.com/macros/s/AKfycbwcaXcpdsonX5eGRd0T-X_yJejKqD0krSSSV3rYDnpot23nWvXkzO3QnnvIo7UqYss1/exec";
const SPREADSHEET_ID = "1H5Z1OJxzvk39vjtrdDYzESU61NV7DGPw6K_iD97nh7U";
const TARGET_SHEET = "Account";

async function getGoogleSheetsClient(isWrite = false) {
  const scopes = isWrite
    ? ["https://www.googleapis.com/auth/spreadsheets"]
    : ["https://www.googleapis.com/auth/spreadsheets.readonly"];

  const auth = new google.auth.GoogleAuth({
    credentials: {
      client_email: process.env.GOOGLE_CLIENT_EMAIL,
      private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
    },
    scopes,
  });
  return google.sheets({ version: "v4", auth });
}

// --- GET Handler ---
export async function GET(request) {
  try {
    await connectToDatabase();
    const { searchParams } = new URL(request.url);
    const uidToFind = searchParams.get("uid");

    // ++ ADDED: Logic mới để lấy token từ sheet
    if (uidToFind) {
      const sheets = await getGoogleSheetsClient(false); // Chỉ cần quyền đọc
      const response = await sheets.spreadsheets.values.get({
        spreadsheetId: SPREADSHEET_ID,
        range: `${TARGET_SHEET}!B:E`, // Đọc từ cột UID (B) đến cột Token (E)
      });

      const rows = response.data.values || [];
      for (const row of rows) {
        const uidInSheet = row[0]; // Cột B là UID
        const tokenInSheet = row[3]; // Cột E là Token
        if (uidInSheet === uidToFind) {
          return NextResponse.json({ success: true, token: tokenInSheet });
        }
      }
      return NextResponse.json({
        success: false,
        message: "Không tìm thấy token cho UID này.",
      });
    }

    // Logic cũ để lấy danh sách tài khoản
    const accounts = await ZaloAccount.find({}, { __v: 0 })
      .populate({ path: "user", select: "name phone avt" })
      .lean();
    return NextResponse.json(
      { status: 2, mes: "Lấy danh sách tài khoản thành công.", data: accounts },
      { status: 200 },
    );
  } catch (error) {
    return NextResponse.json(
      {
        status: 0,
        mes: "Lỗi khi lấy dữ liệu.",
        data: { error: error.message },
      },
      { status: 500 },
    );
  }
}

// --- POST Handler ---
export async function POST(request) {
  try {
    const body = await request.json();
    const { token } = body;

    if (!token || typeof token !== "string") {
      // ERROR: Invalid Token
      return NextResponse.json(
        {
          status: 0,
          mes: "Token không hợp lệ hoặc không được cung cấp.",
          data: null,
        },
        { status: 400 },
      );
    }

    const scriptResponse = await fetch(APPS_SCRIPT_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ token }),
      cache: "no-store",
    });

    const accountData = await scriptResponse.json();
    console.log(accountData, 1);

    if (!scriptResponse.ok || accountData.error || !accountData.userId) {
      return NextResponse.json(
        {
          status: 0,
          mes: "Lỗi từ Apps Script hoặc token không hợp lệ.",
          data: accountData,
        },
        { status: 502 }, // 502 Bad Gateway is appropriate here
      );
    }

    // 2. Chuẩn bị dữ liệu và kết nối
    const newRowData = [
      accountData.phone || "",
      accountData.userId || "",
      accountData.name || "",
      accountData.avatar || "",
      accountData.token || "",
    ];

    const dataForMongo = {
      uid: accountData.userId,
      name: accountData.name,
      phone: accountData.phone,
      avt: accountData.avatar,
    };

    // Connect to DB and get Sheets client
    await connectToDatabase();
    const sheets = await getGoogleSheetsClient(true);

    // 3. Tìm UID trong Sheet để quyết định update hay append
    const getRows = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `${TARGET_SHEET}!B:B`, // Chỉ đọc cột UID (cột B)
    });

    const uids = getRows.data.values ? getRows.data.values.flat() : [];
    const existingRowIndex = uids.findIndex(
      (uid) => uid === accountData.userId,
    );

    if (existingRowIndex !== -1) {
      // Nếu UID đã tồn tại -> Cập nhật (UPDATE)
      const rowToUpdate = existingRowIndex + 1;
      await sheets.spreadsheets.values.update({
        spreadsheetId: SPREADSHEET_ID,
        range: `${TARGET_SHEET}!A${rowToUpdate}:E${rowToUpdate}`,
        valueInputOption: "USER_ENTERED",
        requestBody: { values: [newRowData] },
      });
    } else {
      // Nếu UID chưa tồn tại -> Thêm mới (APPEND)
      await sheets.spreadsheets.values.append({
        spreadsheetId: SPREADSHEET_ID,
        range: `${TARGET_SHEET}!A1`,
        valueInputOption: "USER_ENTERED",
        requestBody: { values: [newRowData] },
      });
    }

    // 4. Cập nhật hoặc tạo mới trong MongoDB (UPSERT)
    await ZaloAccount.findOneAndUpdate(
      { uid: dataForMongo.uid },
      dataForMongo,
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );

    Re_user();
    Re_acc();
    return NextResponse.json(
      {
        status: 2,
        mes: "Xử lý tài khoản thành công.",
        data: accountData,
      },
      { status: 201 },
    );
  } catch (error) {
    return NextResponse.json(
      {
        status: 0,
        mes: "Đã xảy ra lỗi không xác định.",
        data: { error: error.message },
      },
      { status: 500 },
    );
  }
}
