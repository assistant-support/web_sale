// File: /api/roleuser/[id]/route.js (Tạo file này nếu chưa có)

import { NextResponse } from 'next/server';
import connectDB from '@/config/connectDB';
import PostUser from '@/models/users';
import { reloadUser } from '@/data/actions/reload';

export async function PATCH(req, { params }) {
    try {
        await connectDB();
        const { id } = params;
        const { name, phone, address, role, group } = await req.json(); // MỚI: Nhận cả group

        if (!id) {
            return new NextResponse(JSON.stringify({ error: 'Thiếu ID người dùng' }), { status: 400 });
        }
        
        // Tạo object chứa các trường cần cập nhật
        const updateData = {
            name,
            phone,
            address,
            role: [role], // Form gửi lên role là string, model yêu cầu array
            group // MỚI
        };

        const updatedUser = await PostUser.findByIdAndUpdate(id, updateData, { new: true });

        if (!updatedUser) {
            return new NextResponse(JSON.stringify({ error: 'Không tìm thấy người dùng' }), { status: 404 });
        }

        reloadUser(); // Làm mới cache/dữ liệu
        return new NextResponse(JSON.stringify({ message: 'Cập nhật thành công', user: updatedUser }), { status: 200 });

    } catch (error) {
        console.error("Lỗi cập nhật user:", error);
        return new NextResponse(JSON.stringify({ error: 'Lỗi máy chủ' }), { status: 500 });
    }
}