import connectDB from '@/config/connectDB'
import FilterCustomer from '@/models/filter_customer.model'
import mongoose from 'mongoose'

/**
 * Cập nhật bảng Fillter_customer khi bd (birthday) của customer thay đổi
 * @param {string} customerId - ID của customer
 * @param {Date|null} newBd - Ngày sinh mới (có thể null nếu xóa)
 * @param {Date|null} oldBd - Ngày sinh cũ (để xóa khỏi tháng cũ khi cập nhật)
 */
export async function updateFilterCustomer(customerId, newBd, oldBd = null) {
    try {
        if (!customerId || !mongoose.Types.ObjectId.isValid(customerId)) {
            console.warn('⚠️ [updateFilterCustomer] Customer ID không hợp lệ:', customerId)
            return
        }

        await connectDB()

        // Đảm bảo collection tồn tại
        if (!FilterCustomer.collection) {
            await FilterCustomer.createCollection()
        }

        const customerObjectId = new mongoose.Types.ObjectId(customerId)

        // Xóa khỏi tháng cũ nếu có
        if (oldBd && oldBd instanceof Date && !isNaN(oldBd.getTime())) {
            const oldMonth = oldBd.getMonth() + 1 // getMonth() trả về 0-11, cần +1 để có 1-12
            const oldMonthKey = `month${oldMonth}`
            
           
            // Query trực tiếp từ database
            const db = mongoose.connection.db
            if (db) {
                let collection = db.collection('Fillter_customer')
                let count = await collection.countDocuments({})
                
                if (count === 0) {
                    collection = db.collection('Filter_customer')
                    count = await collection.countDocuments({})
                }
                
                if (count > 0) {
                    // Tìm tất cả documents có chứa customer ID trong tháng cũ
                    const docs = await collection.find({}).toArray()
                    
                    for (const doc of docs) {
                        if (doc[oldMonthKey] && Array.isArray(doc[oldMonthKey])) {
                            const hasCustomer = doc[oldMonthKey].some(
                                id => String(id) === String(customerId)
                            )
                            
                            if (hasCustomer) {
                                // Xóa customer ID khỏi mảng
                                await collection.updateOne(
                                    { _id: doc._id },
                                    { $pull: { [oldMonthKey]: customerObjectId } }
                                )
                                console.log(`✅ [updateFilterCustomer] Đã xóa khỏi ${oldMonthKey} trong document ${doc._id}`)
                            }
                        }
                    }
                }
            }
        }

        // Thêm vào tháng mới nếu có
        if (newBd && newBd instanceof Date && !isNaN(newBd.getTime())) {
            const newMonth = newBd.getMonth() + 1 // getMonth() trả về 0-11, cần +1 để có 1-12
            const newMonthKey = `month${newMonth}`
            
            console.log(`🔄 [updateFilterCustomer] Thêm customer ${customerId} vào ${newMonthKey}`)
            
            // Query trực tiếp từ database
            const db = mongoose.connection.db
            if (db) {
                let collection = db.collection('Fillter_customer')
                let count = await collection.countDocuments({})
                
                if (count === 0) {
                    collection = db.collection('Filter_customer')
                    count = await collection.countDocuments({})
                }
                
                // Tìm document có chứa tháng này (hoặc bất kỳ document nào)
                let targetDoc = await collection.findOne({ [newMonthKey]: { $exists: true } })
                
                // Nếu không tìm thấy document có tháng này, tìm document bất kỳ để thêm vào
                if (!targetDoc) {
                    targetDoc = await collection.findOne({})
                }
                
                if (!targetDoc) {
                    // Tạo document mới với tháng này
                    const newDoc = {
                        [newMonthKey]: [customerObjectId]
                    }
                    const result = await collection.insertOne(newDoc)
                    console.log(`✅ [updateFilterCustomer] Đã tạo document mới với ${newMonthKey}:`, result.insertedId)
                } else {
                    // Kiểm tra xem customer đã có trong mảng chưa
                    const hasCustomer = targetDoc[newMonthKey]?.some(
                        id => String(id) === String(customerId)
                    )
                    
                    if (!hasCustomer) {
                        // Đảm bảo field tồn tại trước khi thêm
                        if (!targetDoc[newMonthKey]) {
                            // Nếu field chưa tồn tại, tạo mới
                            await collection.updateOne(
                                { _id: targetDoc._id },
                                { $set: { [newMonthKey]: [customerObjectId] } }
                            )
                            console.log(`✅ [updateFilterCustomer] Đã tạo field ${newMonthKey} và thêm customer vào document ${targetDoc._id}`)
                        } else {
                            // Thêm customer ID vào mảng
                            await collection.updateOne(
                                { _id: targetDoc._id },
                                { $addToSet: { [newMonthKey]: customerObjectId } } // $addToSet để tránh trùng lặp
                            )
                            console.log(`✅ [updateFilterCustomer] Đã thêm vào ${newMonthKey} trong document ${targetDoc._id}`)
                        }
                    } else {
                        console.log(`ℹ️ [updateFilterCustomer] Customer đã có trong ${newMonthKey}`)
                    }
                }
            }
        } else if (newBd === null && oldBd) {
            // Nếu newBd là null và có oldBd, chỉ cần xóa (đã xử lý ở trên)
            console.log(`ℹ️ [updateFilterCustomer] Đã xóa customer khỏi tháng cũ, không có tháng mới`)
        }
    } catch (error) {
        console.error('❌ [updateFilterCustomer] Lỗi:', error)
        // Không throw error để không làm gián đoạn flow chính
    }
}

