import { ZaloAccount as ZaloAccountNew } from '@/models/zalo-account.model'
import connectDB from '@/config/connectDB'
import { cacheData } from '@/lib/cache'

async function dataZalo(_id) {
    try {
        await connectDB()
        const query = _id ? { _id } : { status: 'active' } // Chỉ lấy tài khoản active
        const zaloAccounts = await ZaloAccountNew.find(query).sort({ updatedAt: 1 }).lean()
        
        if (_id && zaloAccounts.length === 0) return null
        
        // Format dữ liệu để tương thích với code cũ
        const formatted = zaloAccounts.map(acc => ({
            _id: acc._id.toString(),
            name: acc.profile?.displayName || 'Zalo Account',
            phone: acc.profile?.phoneMasked || '',
            avt: acc.profile?.avatar || '',
            uid: acc.accountKey, // accountKey là uid trong hệ thống mới
            accountKey: acc.accountKey,
            status: acc.status,
            // Giữ các trường cũ để tương thích
            rateLimitPerHour: 999,
            rateLimitPerDay: 9999
        }))
        
        return JSON.parse(JSON.stringify(formatted))
    } catch (error) {
        console.error('Lỗi trong dataZalo:', error)
        throw new Error('Không thể lấy dữ liệu Zalo.')
    }
}

export async function getZaloAll() {
    try {
        const cachedFunction = cacheData(() => dataZalo(), ['zalo'])
        return await cachedFunction()
    } catch (error) {
        console.error('Lỗi trong ZaloAll:', error)
        return null
    }
}

export async function getZaloOne(_id) {
    try {
        const cachedFunction = cacheData(() => dataZalo({ _id }), [`zalo:${_id}`])
        return cachedFunction()
    } catch (error) {
        console.error('Lỗi trong ZaloOne:', error)
        return null
    }
}

export async function getZaloAllNoCache() {
    try {
        console.log('🔥 Lấy Zalo từ DB (NO CACHE)')
        return await dataZalo()
    } catch (error) {
        console.error(error)
        return null
    }
}
export async function getZaloOneNoCache(_id) {
    try {
        return await dataZalo({ _id })
    } catch (error) {
        console.error(error)
        return null
    }
}


