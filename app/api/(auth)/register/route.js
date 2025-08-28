import bcrypt from 'bcryptjs';
import { NextResponse } from 'next/server';
import connectDB from '@/config/connectDB';
import PostUser from '@/models/users';
import { reloadUser } from '@/data/actions/reload';

export async function POST(req) {
    try {
        await connectDB();
        const {
            name,
            address = '',
            avt = '',
            role = ["Teacher"],
            phone = '',
            email,
            password
        } = await req.json();

        if (!email || !password) {
            return jsonRes(400, { error: 'Email và mật khẩu là bắt buộc' });
        }

        const exists = await PostUser.exists({ email });
        if (exists) {
            return jsonRes(409, { error: 'Email đã tồn tại' });
        }

        const hash = await bcrypt.hash(password, 10);      

        await PostUser.create({
            name,
            address,
            avt,
            role,
            phone,
            email,
            uid: hash                                    
        });
        reloadUser()
        return jsonRes(201, { message: 'Tạo tài khoản thành công' });
    } catch (err) {
        console.error(err);
        return jsonRes(500, { error: 'Lỗi máy chủ' });
    }
}

function corsHeaders() {
    return {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization'
    };
}
function jsonRes(status, body) {
    return new NextResponse(JSON.stringify(body), {
        status,
        headers: { ...corsHeaders(), 'Content-Type': 'application/json' }
    });
}

export async function OPTIONS() {
    return new NextResponse(null, { status: 204, headers: corsHeaders() });
}
