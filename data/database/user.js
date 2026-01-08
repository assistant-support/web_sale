import User from '@/models/users'
import { ZaloAccount as ZaloAccountNew } from '@/models/zalo-account.model'
import connectDB from '@/config/connectDB'
import { cacheData } from '@/lib/cache'

async function dataUser(_id) {
    try {
        await connectDB()
        let query = _id ? { _id } : {}
        let data = {}
        if (_id) {
            // Lấy user với populate zalo từ ZaloAccount mới
            const users = await User.find(query).lean();
            
            // Populate zalo từ ZaloAccount mới thay vì model cũ
            data = await Promise.all(users.map(async (user) => {
                if (user.zalo) {
                    // Tìm trong ZaloAccount mới
                    const zaloAccount = await ZaloAccountNew.findById(user.zalo).lean();
                    if (zaloAccount) {
                        // Format để tương thích với code cũ
                        return {
                            ...user,
                            zalo: {
                                _id: zaloAccount._id.toString(),
                                name: zaloAccount.profile?.displayName || 'Zalo Account',
                                phone: zaloAccount.profile?.phoneMasked || '',
                                avt: zaloAccount.profile?.avatar || '',
                                uid: zaloAccount.accountKey,
                                accountKey: zaloAccount.accountKey,
                                status: zaloAccount.status,
                                // Giữ action rỗng vì không còn trong ZaloAccount mới
                                action: []
                            }
                        };
                    }
                }
                return user;
            }));
        } else {
            data = await User.find({
                ...query,
                uid: { $exists: true, $ne: null }
            }, { uid: 0 }).lean().exec();
        }
        return JSON.parse(JSON.stringify(data))
    } catch (error) {
        console.error('Lỗi trong dataUser:', error)
        throw new Error('Không thể lấy dữ liệu người dùng.')
    }
}

export async function getUserAll() {
    try {
        const cachedFunction = cacheData(() => dataUser(), ['users'])
        return await cachedFunction()
    } catch (error) {
        console.error('Lỗi trong UserAll:', error)
        return null
    }
}

export async function getUserOne(_id) {
    try {
        const cachedFunction = cacheData(() => dataUser(_id), [`user:${_id}`])
        return await cachedFunction()
    } catch (error) {
        console.error('Lỗi trong UserAll:', error)
        return null
    }
}

