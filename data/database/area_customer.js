import AreaCustomer from '@/models/area_customer.model'
import connectDB from '@/config/connectDB'
import { cacheData } from '@/lib/cache'
import mongoose from 'mongoose'

async function dataAreaCustomer(_id) {
    try {
        await connectDB()
        const query = _id ? { _id } : {}
        console.log('🔍 [dataAreaCustomer] Query:', query)
        console.log('🔍 [dataAreaCustomer] Model:', AreaCustomer.modelName)
        
        // Đảm bảo model đã được khởi tạo và có collection
        if (!AreaCustomer.collection) {
            console.log('⚠️ [dataAreaCustomer] Model chưa có collection, đang khởi tạo...')
            await AreaCustomer.createCollection()
        }
        
        console.log('🔍 [dataAreaCustomer] Collection name:', AreaCustomer.collection.name)
        
        // Thử query trực tiếp từ database collection trước để kiểm tra
        const db = mongoose.connection.db
        if (db) {
            const directCollection = db.collection('area_customer')
            const directCount = await directCollection.countDocuments({})
            console.log('📊 [dataAreaCustomer] Số lượng documents trong collection "area_customer" (query trực tiếp):', directCount)
            
            if (directCount > 0) {
                // Chuyển đổi _id sang ObjectId nếu có
                let directQuery = {}
                if (_id) {
                    try {
                        const ObjectId = mongoose.Types.ObjectId || mongoose.Schema.Types.ObjectId
                        directQuery._id = ObjectId.isValid(_id) 
                            ? new ObjectId(_id) 
                            : _id
                    } catch (e) {
                        directQuery._id = _id
                    }
                }
                const directData = await directCollection.find(directQuery).project({ name: 1, type_area: 1, _id: 1 }).toArray()
                console.log('📦 [dataAreaCustomer] Dữ liệu từ collection trực tiếp:', directData)
                const result = JSON.parse(JSON.stringify(directData))
                return result
            }
        }
        
        // Nếu query trực tiếp không có dữ liệu, thử dùng model
        const count = await AreaCustomer.countDocuments(query)
        console.log('📊 [dataAreaCustomer] Số lượng documents từ model:', count)
        
        const areaCustomer = await AreaCustomer.find(query).select('name type_area _id').lean()
        console.log('📦 [dataAreaCustomer] Kết quả query từ model:', {
            count: areaCustomer?.length,
            sample: areaCustomer?.[0],
            all: areaCustomer
        })
        
        if (_id && areaCustomer.length === 0) return null
        const result = JSON.parse(JSON.stringify(areaCustomer))
        console.log('✅ [dataAreaCustomer] Kết quả sau parse:', result)
        return result
    } catch (error) {
        console.error('❌ Lỗi trong dataAreaCustomer:', error)
        throw new Error('Không thể lấy dữ liệu khu vực khách hàng.')
    }
}

export async function getAreaCustomerAll() {
    try {
        console.log('🔄 [getAreaCustomerAll] Bắt đầu lấy dữ liệu...')
        // Tạm thời bypass cache để debug - sẽ bật lại sau
        const result = await dataAreaCustomer()
        console.log('📦 [getAreaCustomerAll] Kết quả (bypass cache):', {
            type: typeof result,
            isArray: Array.isArray(result),
            length: result?.length,
            data: result
        })
        return result
        // TODO: Bật lại cache sau khi fix xong
        // const cachedFunction = cacheData(() => dataAreaCustomer(), ['area_customers'])
        // const result = await cachedFunction()
        // return result
    } catch (error) {
        console.error('❌ Lỗi trong getAreaCustomerAll:', error)
        return null
    }
}

export async function getAreaCustomerOne(_id) {
    try {
        const cachedFunction = cacheData(() => dataAreaCustomer(_id), [`area_customer:${_id}`])
        return cachedFunction()
    } catch (error) {
        console.error('Lỗi trong getAreaCustomerOne:', error)
        return null
    }
}

