import Form from '@/models/formclient'
import '@/models/users'
import connectDB from '@/config/connectDB'
import { cacheData } from '@/lib/cache'
import Customer from '@/models/customer.model'

async function dataForm(id) {
    try {
        await connectDB()
        const aggregationPipeline = [
            { $sort: { createdAt: -1 } },
            {
                $lookup: {
                    from: 'customers',
                    localField: '_id',
                    foreignField: 'source',
                    as: 'customers'
                }
            },
            {
                $addFields: {
                    customerCount: { $size: '$customers' },
                    customerTimes: {
                        $map: { input: '$customers', as: 'customer', in: '$$customer.createAt' }
                    }
                }
            },
            { $project: { customers: 0 } }
        ]
        let forms;
        if (id) {
            forms = await Form.findById(id).lean()
        } else {
            forms = await Form.aggregate(aggregationPipeline)
            await Form.populate(forms, { path: 'createdBy', select: 'name' })
        }
        return JSON.parse(JSON.stringify(forms))
    } catch (error) {
        console.error('Lỗi trong dataForm:', error)
        throw new Error('Không thể lấy dữ liệu form.')
    }
}

export async function getFormAll() {
    try {
        const cachedFunction = cacheData(() => dataForm(), ['forms'])
        return await cachedFunction()
    } catch (error) {
        console.error('Lỗi trong getFormAll:', error)
        throw new Error('Không thể lấy dữ liệu form.')
    }
}

export async function getFormOne(id) {
    try {
        const cachedFunction = cacheData(() => dataForm(id), ['forms', id])
        return await cachedFunction()
    } catch (error) {
        console.error('Lỗi trong getFormOne:', error)
        throw new Error('Không thể lấy dữ liệu form.')
    }
}

// Lấy danh sách nguồn tin nhắn và các nguồn khác từ sourceDetails
// Chỉ lấy các sourceDetails có dạng "Tin nhắn - {Platform} - {Page Name}"
async function dataMessageSources() {
    try {
        await connectDB()
        // Lấy tất cả sourceDetails không null và không rỗng
        const allSourceDetails = await Customer.distinct('sourceDetails', {
            sourceDetails: { $exists: true, $ne: null, $ne: '' }
        })
        
        // Chỉ lấy các sourceDetails có dạng "Tin nhắn - {Platform} - {Page Name}"
        // Pattern: bắt đầu bằng "Tin nhắn - " và có ít nhất 2 dấu gạch ngang (3 phần)
        const filteredSourceDetails = allSourceDetails
            .filter(s => {
                if (!s || !s.trim()) return false; // Loại bỏ null/empty
                
                const trimmed = s.trim();
                
                // Chỉ lấy các giá trị có dạng "Tin nhắn - {Platform} - {Page Name}"
                // Kiểm tra: bắt đầu bằng "Tin nhắn - " và có ít nhất 2 dấu gạch ngang
                if (trimmed.startsWith('Tin nhắn - ') && trimmed.split(' - ').length >= 3) {
                    return true;
                }
                
                return false;
            })
            .map(s => s.trim());
        
        // Chuyển đổi thành format giống sources: { _id: sourceDetails, name: sourceDetails }
        return filteredSourceDetails.map(s => ({
            _id: s, // Dùng sourceDetails làm _id để filter
            name: s,
            isMessageSource: true // Flag để phân biệt với sources thường
        }))
    } catch (error) {
        console.error('Lỗi trong dataMessageSources:', error)
        return []
    }
}

export async function getMessageSources() {
    try {
        const cachedFunction = cacheData(() => dataMessageSources(), ['message-sources'])
        return await cachedFunction()
    } catch (error) {
        console.error('Lỗi trong getMessageSources:', error)
        return []
    }
}
