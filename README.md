# CRM System - SALE Module

## 📋 Mô tả
Hệ thống CRM cho quản lý khách hàng, dịch vụ, cuộc gọi và tích hợp Zalo.

## 🚀 Cài đặt

### 1. Cài đặt dependencies
```bash
npm install
```

### 2. Cấu hình môi trường
Tạo file `.env.local` với các biến sau:
```env
# Database
MONGODB_URI=your_mongodb_connection_string

# Google Drive (cho upload ảnh)
GOOGLE_CLIENT_EMAIL=your_google_client_email
GOOGLE_PRIVATE_KEY=your_google_private_key

# JWT Secret
JWT_SECRET=your_jwt_secret

# Next.js
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

### 3. Chạy development server
```bash
npm run dev
```

Ứng dụng sẽ chạy tại: http://localhost:3000

### 4. Build production
```bash
npm run build
npm start
```

## 📁 Cấu trúc thư mục
- `/app` - Next.js App Router pages và API routes
- `/components` - React components
- `/models` - MongoDB models
- `/data` - Data access layer
- `/lib` - Utility libraries
- `/config` - Configuration files
- `/public` - Static files

## 🔧 Công nghệ sử dụng
- **Framework**: Next.js 15
- **React**: 19
- **Database**: MongoDB (Mongoose)
- **UI**: Radix UI, TailwindCSS
- **Real-time**: Socket.io
- **Authentication**: JWT
- **File Storage**: Google Drive API
- **Charts**: Chart.js

## 📝 Lưu ý
- Đảm bảo MongoDB đang chạy
- Cấu hình đúng Google Drive credentials
- Set JWT_SECRET mạnh cho môi trường production

