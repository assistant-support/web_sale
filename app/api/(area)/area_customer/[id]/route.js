export const dynamic = 'force-dynamic';

import connectDB from '@/config/connectDB'
import AreaCustomer from '@/models/area_customer.model'
import jsonRes from '@/utils/response'
import { reloadAreaCustomer } from '@/data/actions/reload'
import authenticate from '@/utils/authenticate'
import mongoose from 'mongoose'

export async function PUT(request, { params }) {
    try {
        const { user, body } = await authenticate(request)
        // Không yêu cầu Admin role, cho phép tất cả user đã đăng nhập
        const { id } = await params
        
        if (!id || !mongoose.Types.ObjectId.isValid(id)) {
            return jsonRes(400, { status: false, mes: 'ID khu vực không hợp lệ.', data: [] })
        }

        const { name, type_area } = body
        if (!name || !name.trim()) {
            return jsonRes(400, { status: false, mes: 'Tên khu vực là bắt buộc.', data: [] })
        }

        await connectDB()
        
        // Kiểm tra xem khu vực có tồn tại không
        const areaCustomer = await AreaCustomer.findById(id)
        if (!areaCustomer) {
            return jsonRes(404, { status: false, mes: 'Không tìm thấy khu vực để cập nhật.', data: [] })
        }

        // Kiểm tra xem tên khu vực mới có trùng với khu vực khác không (không phân biệt hoa thường)
        const trimmedName = name.trim()
        const escapedName = trimmedName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
        const existingArea = await AreaCustomer.findOne({ 
            name: { $regex: new RegExp(`^${escapedName}$`, 'i') },
            _id: { $ne: id } // Loại trừ chính khu vực đang sửa
        })
        
        if (existingArea) {
            console.log('⚠️ [API] Tên khu vực đã tồn tại:', trimmedName);
            return jsonRes(409, { status: false, mes: 'Tên khu vực đã có', data: [] })
        }

        // Cập nhật khu vực
        const updatedArea = await AreaCustomer.findByIdAndUpdate(
            id,
            { 
                name: trimmedName,
                type_area: type_area?.trim() || null
            },
            { new: true, runValidators: true }
        )
        
        await reloadAreaCustomer()
        
        return jsonRes(200, { status: true, mes: 'Cập nhật khu vực thành công', data: updatedArea })
    } catch (err) {
        const code = err.message === 'Authentication failed' ? 401 : 500
        return jsonRes(code, { status: false, mes: err.message, data: [] })
    }
}

export async function DELETE(request, { params }) {
    try {
        const { user } = await authenticate(request)
        // Không yêu cầu Admin role, cho phép tất cả user đã đăng nhập
        const { id } = await params
        
        if (!id || !mongoose.Types.ObjectId.isValid(id)) {
            return jsonRes(400, { status: false, mes: 'ID khu vực không hợp lệ.', data: [] })
        }

        await connectDB()
        
        // Kiểm tra xem khu vực có tồn tại không
        const areaCustomer = await AreaCustomer.findById(id)
        if (!areaCustomer) {
            return jsonRes(404, { status: false, mes: 'Không tìm thấy khu vực để xóa.', data: [] })
        }

        // Kiểm tra xem khu vực có đang được sử dụng bởi khách hàng nào không
        if (areaCustomer.id_customer && areaCustomer.id_customer.length > 0) {
            return jsonRes(409, { status: false, mes: 'Không thể xóa khu vực này vì đang có khách hàng sử dụng.', data: [] })
        }

        // Xóa khu vực
        await AreaCustomer.findByIdAndDelete(id)
        await reloadAreaCustomer()
        
        return jsonRes(200, { status: true, mes: 'Xóa khu vực thành công', data: [] })
    } catch (err) {
        const code = err.message === 'Authentication failed' ? 401 : 500
        return jsonRes(code, { status: false, mes: err.message, data: [] })
    }
}

