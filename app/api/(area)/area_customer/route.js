export const dynamic = 'force-dynamic';

import connectDB from '@/config/connectDB'
import AreaCustomer from '@/models/area_customer.model'
import jsonRes from '@/utils/response'
import { reloadAreaCustomer } from '@/data/actions/reload'
import authenticate from '@/utils/authenticate'

export async function POST(request) {
    try {
        const { user, body } = await authenticate(request)
        // Không yêu cầu Admin role, cho phép tất cả user đã đăng nhập
        await connectDB()
        const { name, type_area } = body
        if (!name || !name.trim()) {
            return jsonRes(400, { status: false, mes: 'Tên khu vực là bắt buộc.', data: [] })
        }
        // Kiểm tra xem khu vực đã tồn tại chưa (không phân biệt hoa thường)
        const trimmedName = name.trim()
        // Escape các ký tự đặc biệt trong regex
        const escapedName = trimmedName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
        const existingArea = await AreaCustomer.findOne({ 
            name: { $regex: new RegExp(`^${escapedName}$`, 'i') } 
        })
        if (existingArea) {
            console.log('⚠️ [API] Tên khu vực đã tồn tại:', trimmedName);
            return jsonRes(409, { status: false, mes: 'Tên khu vực đã có', data: [] })
        }
        const newAreaCustomer = await AreaCustomer.create({ 
            name: name.trim(), 
            type_area: type_area?.trim() || null,
            id_customer: []
        })
        await reloadAreaCustomer()
        return jsonRes(201, { status: true, mes: 'Tạo khu vực thành công', data: newAreaCustomer })
    } catch (err) {
        const code = err.message === 'Authentication failed' ? 401 : 500
        return jsonRes(code, { status: false, mes: err.message, data: [] })
    }
}

