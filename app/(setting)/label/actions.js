'use server';

import { unstable_cache as cache, revalidateTag } from 'next/cache';
import dbConnect from '@/config/connectDB';
import Label from '@/models/label.model'; // Đảm bảo đường dẫn này chính xác

/**
 * Lấy tất cả các nhãn từ database.
 * Dữ liệu được cache lại để tăng hiệu suất.
 * Cache sẽ được làm mới (revalidate) sau 1 giờ (3600s) hoặc khi có tag 'labels' được revalidate.
 */
export const getLabelData = cache(
    async () => {
        try {
            await dbConnect();
            const allLabels = await Label.find({}).sort({ createdAt: 'desc' });
            // Dùng JSON.parse(JSON.stringify(...)) để đảm bảo dữ liệu an toàn khi gửi tới client component.
            return JSON.parse(JSON.stringify(allLabels));
        } catch (error) {
            console.error("Lỗi khi lấy dữ liệu nhãn:", error);
            return [];
        }
    },
    ['getLabelData'], // Key cho cache
    {
        revalidate: 3600, // Cache trong 1 giờ
        tags: ['labels'], // Tag để có thể revalidate theo yêu cầu
    }
);

/**
 * Tạo một nhãn mới.
 */
export async function createLabel(formData) {
    const name = formData.get('name');
    const color = formData.get('color');

    if (!name || !color) {
        return { success: false, error: 'Tên và màu của nhãn là bắt buộc.' };
    }

    try {
        await dbConnect();

        const existingLabel = await Label.findOne({ name });
        if (existingLabel) {
            return { success: false, error: 'Tên nhãn đã tồn tại.' };
        }

        const newLabel = new Label({ name, color });
        await newLabel.save();

        // Xóa cache có tag 'labels' để hàm getLabelData lấy lại dữ liệu mới
        revalidateTag('labels');

        return { success: true, label: JSON.parse(JSON.stringify(newLabel)) };
    } catch (error) {
        return { success: false, error: 'Không thể tạo nhãn.' };
    }
}

/**
 * Cập nhật một nhãn đã có.
 */
export async function updateLabel(formData) {
    const id = formData.get('id');
    const name = formData.get('name');
    const color = formData.get('color');

    try {
        await dbConnect();

        const updatedLabel = await Label.findByIdAndUpdate(
            id,
            { name, color },
            { new: true, runValidators: true }
        );

        if (!updatedLabel) {
            return { success: false, error: 'Không tìm thấy nhãn.' };
        }

        revalidateTag('labels');

        return { success: true, label: JSON.parse(JSON.stringify(updatedLabel)) };
    } catch (error) {
        if (error.code === 11000) {
            return { success: false, error: 'Tên nhãn đã tồn tại.' };
        }
        return { success: false, error: 'Không thể cập nhật nhãn.' };
    }
}

/**
 * Xóa một nhãn.
 */
export async function deleteLabel(id) {
    try {
        await dbConnect();
        await Label.findByIdAndDelete(id);
        revalidateTag('labels');
        return { success: true };
    } catch (error) {
        return { success: false, error: 'Không thể xóa nhãn.' };
    }
}

/**
 * Gán hoặc bỏ gán một nhãn cho một khách hàng.
 * Cấu trúc mới: customer là object với page_id làm key, mỗi page_id chứa IDconversation và IDcustomer arrays
 */
export async function toggleLabelForCustomer({ labelId, pageId, conversationId, customerId }) {
    if (!labelId || !pageId || !conversationId) {
        return { success: false, error: 'Thiếu thông tin nhãn, page_id hoặc conversation_id.' };
    }

    try {
        await dbConnect();
        const label = await Label.findById(labelId);

        if (!label) {
            return { success: false, error: 'Không tìm thấy nhãn.' };
        }

        // Xử lý trường hợp customer là array cũ hoặc object mới
        let customerData = {};
        if (Array.isArray(label.customer)) {
            // Nếu là array, có thể là:
            // 1. Array cũ: [] hoặc ["conversation_id1", "conversation_id2"]
            // 2. Array chứa object: [{ pzl_xxx: {...} }] - đây là format mới nhưng lưu sai
            if (label.customer.length > 0 && typeof label.customer[0] === 'object' && !Array.isArray(label.customer[0])) {
                // Trường hợp array chứa object - merge tất cả objects lại
                console.log('⚠️ [toggleLabelForCustomer] Customer là array chứa object, merge thành object');
                label.customer.forEach((item) => {
                    if (item && typeof item === 'object') {
                        customerData = { ...customerData, ...item };
                    }
                });
            } else {
                // Array cũ - chuyển sang object rỗng
                console.log('⚠️ [toggleLabelForCustomer] Converting old array format to new object format');
                customerData = {};
            }
        } else if (label.customer && typeof label.customer === 'object' && !Array.isArray(label.customer)) {
            // Nếu là object (không phải array), sử dụng trực tiếp
            // Tạo deep copy để tránh mutation
            customerData = JSON.parse(JSON.stringify(label.customer));
        } else {
            // Nếu null/undefined/không hợp lệ, khởi tạo object rỗng
            customerData = {};
        }

        // Khởi tạo pageData nếu chưa có
        if (!customerData[pageId]) {
            customerData[pageId] = { IDconversation: [], IDcustomer: [] };
        }
        const pageData = customerData[pageId];

        // Đảm bảo pageData có đầy đủ cấu trúc
        if (!Array.isArray(pageData.IDconversation)) {
            pageData.IDconversation = [];
        }
        if (!Array.isArray(pageData.IDcustomer)) {
            pageData.IDcustomer = [];
        }

        // Kiểm tra xem conversation_id đã tồn tại chưa
        const conversationIndex = pageData.IDconversation.findIndex(id => String(id) === String(conversationId));
        const exists = conversationIndex !== -1;

       

        if (exists) {
            // Bỏ gán: xóa conversation_id và customer_id ở cùng index
            pageData.IDconversation.splice(conversationIndex, 1);
            if (pageData.IDcustomer[conversationIndex] !== undefined) {
                pageData.IDcustomer.splice(conversationIndex, 1);
            }
        } else {
            // Gán: thêm conversation_id và customer_id vào cùng index
            pageData.IDconversation.push(conversationId);
            pageData.IDcustomer.push(customerId || '');
        }

        // Cập nhật customer object
        customerData[pageId] = pageData;

        // Đảm bảo customerData là object hợp lệ trước khi lưu (không phải array)
        let finalCustomerData = {};
        if (typeof customerData === 'object' && !Array.isArray(customerData)) {
            finalCustomerData = customerData;
        } else if (Array.isArray(customerData) && customerData.length > 0 && typeof customerData[0] === 'object') {
            // Nếu vẫn là array chứa object, merge lại
            customerData.forEach((item) => {
                if (item && typeof item === 'object') {
                    finalCustomerData = { ...finalCustomerData, ...item };
                }
            });
        }
        
        

        // Đảm bảo lưu đúng format object, không phải array
        const updateResult = await Label.updateOne(
            { _id: labelId }, 
            { $set: { customer: finalCustomerData } }
        );
        
        
        
        // Verify sau khi update
        const updatedLabel = await Label.findById(labelId);
        console.log('🔍 [toggleLabelForCustomer] Verified after update:', {
            customerType: Array.isArray(updatedLabel.customer) ? 'array' : typeof updatedLabel.customer,
            customer: updatedLabel.customer
        });

        revalidateTag('labels');

        return { success: true, message: `Đã ${exists ? 'bỏ gán' : 'gán'} nhãn.` };
    } catch (error) {
        console.error('❌ [toggleLabelForCustomer] Lỗi khi cập nhật nhãn cho khách hàng:', error);
        return { success: false, error: 'Không thể cập nhật nhãn: ' + (error.message || 'Unknown error') };
    }
}

/**
 * Lấy danh sách conversation_id và customer_id mapping từ các label và page id.
 * Cấu trúc mới: customer là object với page_id làm key
 * Trả về mapping conversation_id -> customer_id để có thể sử dụng khi gọi API
 */
export async function getConversationIdsByLabelsAndPage({ labelIds, pageId }) {
    if (!labelIds || !Array.isArray(labelIds) || labelIds.length === 0 || !pageId) {
        return { success: false, error: 'Thiếu thông tin nhãn hoặc page id.', conversationIds: [], conversationCustomerMap: {} };
    }

    try {
      
        await dbConnect();
        const labels = await Label.find({ _id: { $in: labelIds } });

        console.log('📋 [getConversationIdsByLabelsAndPage] Found labels:', labels.length);

        if (labels.length === 0) {
            console.warn('⚠️ [getConversationIdsByLabelsAndPage] Không tìm thấy nhãn');
            return { success: false, error: 'Không tìm thấy nhãn.', conversationIds: [], conversationCustomerMap: {} };
        }

        // Lấy tất cả conversation_ids và mapping với customer_ids từ các labels theo cấu trúc mới
        const allConversationIds = new Set();
        const conversationCustomerMap = {}; // Map conversation_id -> customer_id
        
        labels.forEach((label, labelIndex) => {
           
            // Xử lý trường hợp customer là array cũ hoặc object mới
            let customerData = {};
            if (Array.isArray(label.customer)) {
                // Nếu là array, có thể là:
                // 1. Array cũ: [] hoặc ["conversation_id1", "conversation_id2"]
                // 2. Array chứa object: [{ pzl_xxx: {...} }] - đây là format mới nhưng lưu sai
                if (label.customer.length > 0 && typeof label.customer[0] === 'object' && !Array.isArray(label.customer[0])) {
                    // Trường hợp array chứa object - merge tất cả objects lại
                    
                    label.customer.forEach((item) => {
                        if (item && typeof item === 'object') {
                            customerData = { ...customerData, ...item };
                        }
                    });
                } else {
                    // Array cũ - chuyển sang object rỗng
                    console.log(`⚠️ [getConversationIdsByLabelsAndPage] Label ${label.name} có customer là array cũ, chuyển sang object rỗng`);
                    customerData = {};
                }
            } else if (label.customer && typeof label.customer === 'object' && !Array.isArray(label.customer)) {
                // Object trực tiếp - sử dụng luôn
                customerData = label.customer;
            }
            
            
            
            const pageData = customerData[pageId];
            
            
            if (pageData && Array.isArray(pageData.IDconversation) && Array.isArray(pageData.IDcustomer)) {
                
                pageData.IDconversation.forEach((convId, index) => {
                    if (convId) {
                        const convIdStr = String(convId);
                        allConversationIds.add(convIdStr);
                        // Lưu mapping conversation_id -> customer_id (cùng index)
                        if (pageData.IDcustomer[index] !== undefined && pageData.IDcustomer[index] !== '') {
                            conversationCustomerMap[convIdStr] = String(pageData.IDcustomer[index]);
                        }
                        console.log(`  - Conversation ${index + 1}: ${convIdStr} -> customer: ${pageData.IDcustomer[index] || 'N/A'}`);
                    }
                });
            } else {
                console.log(`⚠️ [getConversationIdsByLabelsAndPage] Không tìm thấy page data hoặc không đúng format cho pageId: ${pageId}`);
            }
        });

        const result = { 
            success: true, 
            conversationIds: Array.from(allConversationIds),
            conversationCustomerMap // Map để có thể lấy customer_id khi gọi API
        };
        
        console.log('✅ [getConversationIdsByLabelsAndPage] Result:', {
            conversationIdsCount: result.conversationIds.length,
            conversationIds: result.conversationIds,
            conversationCustomerMap: result.conversationCustomerMap
        });

        return result;
    } catch (error) {
        console.error('❌ [getConversationIdsByLabelsAndPage] Lỗi khi lấy conversation_id từ labels và page:', error);
        return { success: false, error: 'Không thể lấy danh sách conversation: ' + (error.message || 'Unknown error'), conversationIds: [], conversationCustomerMap: {} };
    }
}