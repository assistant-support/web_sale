import FilterCustomer from '@/models/filter_customer.model'
import connectDB from '@/config/connectDB'
import { cacheData } from '@/lib/cache'
import mongoose from 'mongoose'

async function dataFilterCustomer() {
    try {
        await connectDB()
        
        console.log('🔍 [dataFilterCustomer] Bắt đầu query...')
        
        // Đảm bảo model đã được khởi tạo và có collection
        if (!FilterCustomer.collection) {
            console.log('⚠️ [dataFilterCustomer] Model chưa có collection, đang khởi tạo...')
            await FilterCustomer.createCollection()
        }
        
        console.log('🔍 [dataFilterCustomer] Collection name:', FilterCustomer.collection.name)
        
        // Thử query trực tiếp từ database collection trước
        // Thử cả 2 tên collection: Fillter_customer (có thể có typo) và Filter_customer
        const db = mongoose.connection.db
        if (db) {
            // Thử Fillter_customer trước (có thể có typo)
            let directCollection = db.collection('Fillter_customer')
            let directCount = await directCollection.countDocuments({})
            console.log('📊 [dataFilterCustomer] Số lượng documents trong collection "Fillter_customer":', directCount)
            
            // Nếu không có, thử Filter_customer
            if (directCount === 0) {
                directCollection = db.collection('Filter_customer')
                directCount = await directCollection.countDocuments({})
                console.log('📊 [dataFilterCustomer] Số lượng documents trong collection "Filter_customer":', directCount)
            }
            
            if (directCount > 0) {
                const directData = await directCollection.find({}).toArray()
                console.log('📦 [dataFilterCustomer] Dữ liệu từ collection trực tiếp:', directData)
                const result = JSON.parse(JSON.stringify(directData))
                return result
            }
        }
        
        // Nếu query trực tiếp không có dữ liệu, thử dùng model
        const count = await FilterCustomer.countDocuments({})
        console.log('📊 [dataFilterCustomer] Số lượng documents từ model:', count)
        
        const filterData = await FilterCustomer.find({}).lean()
        console.log('📦 [dataFilterCustomer] Dữ liệu từ model:', filterData)
        
        const result = JSON.parse(JSON.stringify(filterData))
        console.log('✅ [dataFilterCustomer] Kết quả sau parse:', result)
        return result
    } catch (error) {
        console.error('❌ Lỗi trong dataFilterCustomer:', error)
        throw new Error('Không thể lấy dữ liệu filter customer.')
    }
}

export async function getFilterCustomerAll() {
    try {
        // Tạm thời bypass cache để test
        const result = await dataFilterCustomer()
        console.log('📦 [getFilterCustomerAll] Kết quả:', {
            type: typeof result,
            isArray: Array.isArray(result),
            length: result?.length,
            sample: result?.[0]
        })
        return result
        // Sau khi test xong, có thể bật lại cache:
        // const cachedFunction = cacheData(() => dataFilterCustomer(), ['filter_customers'])
        // const result = await cachedFunction()
        // return result
    } catch (error) {
        console.error('❌ Lỗi trong getFilterCustomerAll:', error)
        return []
    }
}

