import AreaCustomer from '@/models/area_customer.model'
import connectDB from '@/config/connectDB'
import { cacheData } from '@/lib/cache'
import mongoose from 'mongoose'

async function dataAreaCustomer(_id) {
    try {
        await connectDB()
        const query = _id ? { _id } : {}
       
        // Thử query trực tiếp để kiểm tra
        const count = await AreaCustomer.countDocuments(query)
        
        // Nếu không có dữ liệu, thử query trực tiếp từ database collection
        if (count === 0 && !_id) {
            const db = mongoose.connection.db
            if (db) {
                const directCollection = db.collection('area_customer')
                const directCount = await directCollection.countDocuments({})
               
                if (directCount > 0) {
                    const directData = await directCollection.find({}).project({ name: 1, type_area: 1, _id: 1 }).toArray()
                    const result = JSON.parse(JSON.stringify(directData))
                    return result
                }
            }
        }
        
        const areaCustomer = await AreaCustomer.find(query).select('name type_area').lean()
        
        if (_id && areaCustomer.length === 0) return null
        const result = JSON.parse(JSON.stringify(areaCustomer))
       
        return result
    } catch (error) {
        console.error('❌ Lỗi trong dataAreaCustomer:', error)
        throw new Error('Không thể lấy dữ liệu khu vực khách hàng.')
    }
}

export async function getAreaCustomerAll() {
    try {
       
        // Tạm thời bypass cache để test
        const result = await dataAreaCustomer()
       
        return result
        // TODO: Bật lại cache sau khi test xong
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

