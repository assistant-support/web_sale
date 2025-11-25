'use server';

import connectDB from '@/config/connectDB';
import Customer from '@/models/customer.model';
import Zalo from '@/models/zalo.model';
import Logs from '@/models/log.model';
import checkAuthToken from '@/utils/checktoken';
import { actionZalo } from '@/function/drive/appscript';
import { revalidateData } from '@/app/actions/customer.actions';

/**
 * Normalize UID format to ensure consistency
 */
function normalizeUid(uid) {
    if (!uid) return null;
    const s = String(uid).trim();
    return s.length > 0 ? s : null;
}

export async function sendZaloMessageAction(previousState, formData) {
   
    // 1. Authentication check
    const user = await checkAuthToken();
    if (!user || !user.id) {
        console.log('❌ [Zalo Message] Not authenticated');
        return { success: false, message: 'Bạn cần đăng nhập để thực hiện hành động này.' };
    }
    if (!user.role.includes('Admin') && !user.role.includes('Sale') && !user.role.includes('Manager')) {
        console.log('❌ [Zalo Message] No permission');
        return { success: false, message: 'Bạn không có quyền thực hiện chức năng này' };
    }

    // 2. Get input data
    const customerId = formData.get('customerId');
    const message = formData.get('message');

    if (!customerId || !message) {
        console.log('❌ [Zalo Message] Missing data', { customerId, message: !!message });
        return { success: false, message: 'Thiếu thông tin cần thiết.' };
    }

   
    try {
        await connectDB();

        // 3. Find customer
        const customer = await Customer.findById(customerId).lean();
        if (!customer) {
            return { success: false, message: 'Không tìm thấy khách hàng.' };
        }

      
        // 4. Find Zalo account
        // PRIORITY 1: Use the Zalo account that found the customer's UID (same as agenda.js)
        let selectedZalo = null;
        if (customer.uid?.[0]?.zalo) {
            selectedZalo = await Zalo.findById(customer.uid[0].zalo).lean();
        }
        
        // PRIORITY 2: If customer doesn't have a Zalo account linked, use user's selection
        if (!selectedZalo && user.zalo) {
            selectedZalo = await Zalo.findById(user.zalo).lean();
        }
        
        // PRIORITY 3: Fallback to any available Zalo account (pick newest)
        if (!selectedZalo) {
            selectedZalo = await Zalo.findOne().sort({ _id: -1 }).lean();
        }

        if (!selectedZalo) {
            console.log('❌ [Zalo Message] No Zalo account found');
            return { success: false, message: 'Không tìm thấy tài khoản Zalo để sử dụng.' };
        }

       
        // 5. Check if customer has Zalo UID
        let uidPerson = null;
       
        const uidEntry = customer.uid?.find(u => u.zalo?.toString() === selectedZalo._id.toString());
        
        
        if (uidEntry && uidEntry.uid) {
            uidPerson = uidEntry.uid;
            
        } else {
            console.log('⚠️ [Zalo Message] No UID found, searching by phone...');
            // Try to find UID by phone using actionZalo
            const findUidResult = await actionZalo({
                phone: customer.phone,
                uid: selectedZalo.uid,
                actionType: 'findUid'
            });
            
           
            if (findUidResult.status) {
                const targetUid = findUidResult.content?.data?.uid;
              
                const normalizedUid = normalizeUid(targetUid);
                
                if (normalizedUid) {
                    // Save UID to customer
                    await Customer.updateOne(
                        { _id: customerId },
                        { 
                            $set: { 
                                zaloavt: findUidResult.content?.data?.avatar || customer.zaloavt || null,
                                zaloname: findUidResult.content?.data?.zalo_name || customer.zaloname || null
                            },
                            $push: { 
                                uid: { 
                                    zalo: selectedZalo._id, 
                                    uid: normalizedUid,
                                    isFriend: 0,
                                    isReques: 0
                                } 
                            } 
                        }
                    );
                    
                    uidPerson = normalizedUid;
                   
                } else {
                    console.log('❌ [Zalo Message] Normalized UID is empty');
                    return { 
                        success: false, 
                        message: 'Không tìm thấy UID Zalo của khách hàng. Vui lòng kiểm tra lại số điện thoại.' 
                    };
                }
            } else {
                console.log('❌ [Zalo Message] Find UID failed:', findUidResult.content?.error_message || findUidResult.message);
                return { 
                    success: false, 
                    message: findUidResult.content?.error_message || findUidResult.message || 'Không tìm thấy UID Zalo của khách hàng. Vui lòng kiểm tra lại số điện thoại.' 
                };
            }
        }

        // 6. Send message via actionZalo
        const phone = customer.phone;
       
        const result = await actionZalo({
            phone: phone,
            uidPerson: uidPerson,
            actionType: 'sendMessage',
            message: message,
            uid: selectedZalo.uid
        });

        
        // 7. Log the action
        await Logs.create({
            status: {
                status: result.status || false,
                message: message,
                data: {
                    error_code: result.content?.error_code || null,
                    error_message: result.content?.error_message || (result.status ? '' : 'Invalid response from AppScript'),
                }
            },
            type: 'sendMessage',
            createBy: user.id,
            customer: customerId,
            zalo: selectedZalo._id,
        });

        // 8. Update pipeline status and add care note if successful
        if (result.status) {
            const newStatus = 'msg_success_2';
            await Customer.findByIdAndUpdate(customerId, {
                $set: {
                    'pipelineStatus.0': newStatus,
                    'pipelineStatus.2': newStatus
                },
                $push: {
                    care: {
                        content: `Hành động [Gửi tin nhắn Zalo] đã hoàn thành thành công.`,
                        step: 2,
                        createBy: user.id,
                        createAt: new Date()
                    }
                }
            });
        } else {
            // Update pipeline status to error if failed
            const newStatus = 'msg_error_2';
            await Customer.updateOne({ _id: customerId }, {
                $set: {
                    'pipelineStatus.0': newStatus,
                    'pipelineStatus.2': newStatus
                },
                $push: {
                    care: {
                        content: `Hành động [Gửi tin nhắn Zalo] thất bại: ${result.content?.error_message || result.message || 'Lỗi không xác định zalo-message.actions.js'}`,
                        step: 2,
                        createBy: user.id,
                        createAt: new Date()
                    }
                }
            });
        }

        // 9. Revalidate data
        await revalidateData();

        if (result.status) {
           
            return { success: true, message: 'Đã gửi tin nhắn thành công!' };
        } else {
            console.log('❌ [Zalo Message] Failed:', result.content?.error_message || result.message);
            return { 
                success: false, 
                message: result.content?.error_message || result.message || 'Gửi tin nhắn thất bại.' 
            };
        }

    } catch (error) {
        console.error('❌ [Zalo Message] Error:', error);
        return { success: false, message: 'Đã xảy ra lỗi khi gửi tin nhắn. Vui lòng thử lại.' };
    }
}

