export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import checkAuthToken from '@/utils/checktoken';
import { getFriendRequestStatus } from '@/data/zalo/chat.actions';
import Customer from '@/models/customer.model';
import { ZaloAccount as ZaloAccountNew } from '@/models/zalo-account.model';
import Zalo from '@/models/zalo.model';
import dbConnect from '@/config/connectDB';

/**
 * API endpoint để lấy trạng thái bạn bè cho một hoặc nhiều khách hàng
 * POST /api/zalo/friend-status
 * Body: { customerIds: string[], accountKey?: string, zaloAccountId?: string }
 */
export async function POST(request) {
    try {
        const session = await checkAuthToken();
        if (!session?.id) {
            return NextResponse.json(
                { success: false, error: 'Yêu cầu đăng nhập.' },
                { status: 401 }
            );
        }

        const body = await request.json();
        const { customerIds, accountKey, zaloAccountId } = body;

        if (!Array.isArray(customerIds) || customerIds.length === 0) {
            return NextResponse.json(
                { success: false, error: 'customerIds phải là mảng không rỗng.' },
                { status: 400 }
            );
        }

        await dbConnect();

        // Tìm accountKey nếu chưa có
        let finalAccountKey = accountKey;
        if (!finalAccountKey && zaloAccountId) {
            // Thử tìm trong ZaloAccountNew trước
            const zaloAccountNew = await ZaloAccountNew.findById(zaloAccountId)
                .select('accountKey status')
                .lean();
            
            if (zaloAccountNew?.status === 'active' && zaloAccountNew?.accountKey) {
                finalAccountKey = zaloAccountNew.accountKey;
            } else {
                // Fallback: tìm trong model cũ
                const zaloAccountOld = await Zalo.findById(zaloAccountId).lean();
                if (zaloAccountOld?.uid) {
                    // Tìm accountKey từ uid
                    const zaloAccountFromUid = await ZaloAccountNew.findOne({
                        $or: [
                            { 'profile.zaloId': String(zaloAccountOld.uid).trim() },
                            { accountKey: String(zaloAccountOld.uid).trim() }
                        ],
                        status: 'active'
                    }).sort({ updatedAt: 1 }).lean();
                    
                    if (zaloAccountFromUid?.accountKey) {
                        finalAccountKey = zaloAccountFromUid.accountKey;
                    }
                }
            }
        }

        // Nếu vẫn chưa có accountKey, lấy account active đầu tiên
        if (!finalAccountKey) {
            const fallbackAccount = await ZaloAccountNew.findOne({ 
                status: 'active' 
            }).sort({ updatedAt: 1 })
            .select('accountKey')
            .lean();
            
            if (fallbackAccount?.accountKey) {
                finalAccountKey = fallbackAccount.accountKey;
            } else {
                return NextResponse.json(
                    { success: false, error: 'Không tìm thấy tài khoản Zalo hợp lệ.' },
                    { status: 400 }
                );
            }
        }

        // Lấy thông tin khách hàng và UID
        const customers = await Customer.find({
            _id: { $in: customerIds }
        }).select('_id uid').lean();

        const results = [];
        
        for (const customer of customers) {
            // Tìm UID đầu tiên hợp lệ
            const uidEntry = customer.uid?.find(u => u && u.uid && String(u.uid).trim().length > 0);
            
            if (!uidEntry || !uidEntry.uid) {
                results.push({
                    customerId: customer._id.toString(),
                    isFriend: null,
                    error: 'Không tìm thấy UID'
                });
                continue;
            }

            try {
                const friendStatus = await getFriendRequestStatus({
                    accountKey: finalAccountKey,
                    friendId: String(uidEntry.uid).trim()
                });

                results.push({
                    customerId: customer._id.toString(),
                    isFriend: friendStatus.ok && friendStatus.is_friend === 1 ? 1 : 0,
                    is_requested: friendStatus.is_requested || 0,
                    is_requesting: friendStatus.is_requesting || 0,
                    error: friendStatus.ok ? null : friendStatus.message
                });
            } catch (err) {
                results.push({
                    customerId: customer._id.toString(),
                    isFriend: null,
                    error: err?.message || 'Lỗi không xác định'
                });
            }
        }

        // Cập nhật isFriend vào database cho mỗi khách hàng
        for (const result of results) {
            if (result.isFriend !== null && result.customerId) {
                try {
                    // Tìm customer và cập nhật isFriend trong uid array
                    const customer = await Customer.findById(result.customerId);
                    if (customer && customer.uid && customer.uid.length > 0) {
                        // Tìm uid entry tương ứng với zaloAccountId
                        const uidEntry = customer.uid.find(u => {
                            if (zaloAccountId) {
                                return String(u.zalo) === String(zaloAccountId);
                            }
                            return true; // Nếu không có zaloAccountId, cập nhật entry đầu tiên
                        });
                        
                        if (uidEntry) {
                            uidEntry.isFriend = result.isFriend;
                            await customer.save();
                            console.log(`[friend-status API] Đã cập nhật isFriend=${result.isFriend} cho customer ${result.customerId}`);
                        }
                    }
                } catch (updateErr) {
                    console.error(`[friend-status API] Lỗi khi cập nhật isFriend cho customer ${result.customerId}:`, updateErr);
                }
            }
        }

        return NextResponse.json({
            success: true,
            results
        });

    } catch (error) {
        console.error('[friend-status API] Lỗi:', error);
        return NextResponse.json(
            {
                success: false,
                error: error?.message || 'Đã xảy ra lỗi phía máy chủ.'
            },
            { status: 500 }
        );
    }
}

