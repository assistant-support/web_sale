import axios from 'axios';

// The access token for your main Pancake account
export const PANCAKE_USER_ACCESS_TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJuYW1lIjoiRGV2IFN1cHBvcnQiLCJleHAiOjE3NzgxNDU4NDgsImFwcGxpY2F0aW9uIjoxLCJ1aWQiOiIwNzUzNDE2YS01NzBlLTRmODItOWI0Ny05ZmUzNTVjOGYzMTgiLCJzZXNzaW9uX2lkIjoiZWI4ODM0YjYtMzZkMi00MDRlLWFlMTUtNDRiMzI0NDExMzhiIiwiaWF0IjoxNzcwMzY5ODQ4LCJmYl9pZCI6IjEyMjE0NzQyMTMzMjY5MDU2MSIsImxvZ2luX3Nlc3Npb24iOm51bGwsImZiX25hbWUiOiJEZXYgU3VwcG9ydCJ9.S20F_NkkGAybGwG4NqPlnwKDp7Shjd5Yn8FiO5i-0Nw';

/**
 * Fetches the list of pages from the Pancake API.
 * @returns {Promise<Array|null>} A promise that resolves to an array of pages or null if an error occurs.
 */
export async function getPagesFromAPI() {
    try {
        console.log('🔄 Attempting to fetch pages from Pancake API...');
        let response = await fetch(`https://pancake.vn/api/v1/pages?access_token=${PANCAKE_USER_ACCESS_TOKEN}`);
        response = await response.json();
        
        // console.log('✅ API response received:', response);
        
        if (response?.success && response?.categorized?.activated) {
            const NAME_KEYWORDS = ['BLING KIM', 'BAC SI BLING KIM','NHAT VINH', 'Trung Đồ Quê'];

            const matchesKeyword = (name) => {
                const normalized = String(name || '')
                    .normalize('NFD')
                    .replace(/[\u0300-\u036f]/g, '')
                    .toUpperCase();
                return NAME_KEYWORDS.some((keyword) => normalized.includes(keyword));
            };

            const pages = response.categorized.activated
                .filter((page) => matchesKeyword(page?.name))
                .filter((page) =>
                    page &&
                    (page.platform === 'facebook' ||
                        page.platform === 'instagram_official' ||
                        page.platform === 'tiktok_business_messaging' ||
                        page.platform === 'personal_zalo')
                )
                .map((page) => ({
                    accessToken: PANCAKE_USER_ACCESS_TOKEN,
                    id: page.id,
                    name: page.name,
                    platform: page.platform,
                    avatar: `https://pancake.vn/api/v1/pages/${page.id}/avatar?access_token=${PANCAKE_USER_ACCESS_TOKEN}`, // URL ảnh avatar
                }));
            
            // console.log('📄 Filtered pages:', pages.length);
            // console.log('📄 Filtered pages data:', pages.map(p => ({ id: p.id, name: p.name, platform: p.platform })));
            return pages;
        }
        
        console.warn('⚠️ API response structure unexpected:', response);
        return [];
    } catch (error) {
        console.error("❌ Failed to fetch pages from Pancake API:", error.message);
        return [];
    }
}

/**
 * Lấy thông tin conversations từ danh sách conversation_ids.
 * Gọi API messages để lấy thông tin cơ bản cho từng conversation.
 * @param {string} pageId - ID của page
 * @param {Array<string>} conversationIds - Danh sách conversation IDs
 * @param {string} accessToken - Access token
 * @param {Object} conversationCustomerMap - Map conversation_id -> customer_id từ database
 */
export async function getConversationsFromIds(pageId, conversationIds, accessToken = PANCAKE_USER_ACCESS_TOKEN, conversationCustomerMap = {}) {
    if (!Array.isArray(conversationIds) || conversationIds.length === 0) {
        return [];
    }

    try {
        // Lấy danh sách conversations hiện tại từ API
        const conversationsUrl = `https://pancake.vn/api/v1/pages/${pageId}/conversations?access_token=${accessToken}&unread_first=true&mode=NONE&tags="ALL"&except_tags=[]&cursor_mode=true&from_platform=web`;
        const response = await fetch(conversationsUrl, { cache: 'no-store' });
        
        let existingConversations = [];
        if (response.ok) {
            const data = await response.json();
            existingConversations = Array.isArray(data?.conversations) ? data.conversations : [];
        }

        // Tìm các conversations đã có trong danh sách hiện tại
        const foundConversations = existingConversations.filter((conv) => {
            return conversationIds.some((id) => {
                return String(conv.id) === String(id) || 
                       String(conv.id).includes(String(id)) || 
                       String(id).includes(String(conv.id));
            });
        });

        // Tìm các conversation_ids chưa có trong danh sách hiện tại
        const foundIds = new Set(foundConversations.map(c => c.id));
        const missingIds = conversationIds.filter(id => {
            return !Array.from(foundIds).some(foundId => 
                String(foundId) === String(id) || 
                String(foundId).includes(String(id)) || 
                String(id).includes(String(foundId))
            );
        });

        // Gọi API messages để lấy thông tin cho các conversations chưa có
        const missingConversations = await Promise.all(
            missingIds.map(async (id) => {
                try {
                    // Xử lý conversation ID format
                    let conversationPath = id;
                    if (id.startsWith('ttm_') || id.startsWith('pzl_') || id.startsWith('igo_')) {
                        conversationPath = id;
                    } else if (id.includes('_') && id.split('_').length >= 2) {
                        conversationPath = id;
                    } else {
                        conversationPath = `${pageId}_${id}`;
                    }

                    // Ưu tiên sử dụng customer_id từ database (conversationCustomerMap)
                    let customerIdForRequest = conversationCustomerMap[id] || null;
                    
                    // Gọi API messages để lấy thông tin conversation
                    // Ưu tiên sử dụng customer_id từ database
                    let messagesUrl = customerIdForRequest
                        ? `https://pancake.vn/api/v1/pages/${pageId}/conversations/${conversationPath}/messages?customer_id=${customerIdForRequest}&access_token=${accessToken}&is_new_api=true&user_view=true&separate_pos=true&count=10`
                        : `https://pancake.vn/api/v1/pages/${pageId}/conversations/${conversationPath}/messages?access_token=${accessToken}&is_new_api=true&user_view=true&separate_pos=true&count=10`;
                    
                    let messagesResponse = await fetch(messagesUrl, { cache: 'no-store' });
                    
                    // Nếu lỗi 400 (thiếu customer_id) và chưa có customer_id từ database, thử extract từ conversation_id
                    if (!messagesResponse.ok && messagesResponse.status === 400 && !customerIdForRequest) {
                        // Với TikTok: ttm_-000P2GGgk_nsouQeH7KP4Qa9bTrwp6f0URw_dTVOZ3FjdW9CUXRwT2Voa0dreGI5eHhLckE9PQ==
                        // Có thể extract customer_id từ phần sau dấu _ thứ 2
                        let customerIdFromConvId = null;
                        if (id.startsWith('ttm_')) {
                            const parts = id.split('_');
                            if (parts.length >= 3) {
                                // Lấy phần sau dấu _ thứ 2 làm customer_id
                                customerIdFromConvId = parts.slice(2).join('_');
                            }
                        } else if (id.includes('_')) {
                            // Với Facebook: pageId_customerId
                            const parts = id.split('_');
                            if (parts.length >= 2) {
                                customerIdFromConvId = parts[parts.length - 1];
                            }
                        }
                        
                        if (customerIdFromConvId) {
                            messagesUrl = `https://pancake.vn/api/v1/pages/${pageId}/conversations/${conversationPath}/messages?customer_id=${customerIdFromConvId}&access_token=${accessToken}&is_new_api=true&user_view=true&separate_pos=true&count=10`;
                            messagesResponse = await fetch(messagesUrl, { cache: 'no-store' });
                        }
                    }
                    
                    if (messagesResponse.ok) {
                        const messagesData = await messagesResponse.json();
                        
                        // Parse messages array từ response
                        const messages = Array.isArray(messagesData?.messages) 
                            ? messagesData.messages 
                            : [];
                        
                        // Lấy conversation_id từ response (có thể ở root level hoặc từ message)
                        const conversationIdFromResponse = messagesData?.conversation_id 
                            || (messages.length > 0 ? messages[0]?.conversation_id : null)
                            || id;
                        
                        // Lấy tin nhắn mới nhất để tạo snippet và updated_at
                        const lastMessage = messages.length > 0 ? messages[messages.length - 1] : null;
                        let snippet = '';
                        let updatedAt = new Date().toISOString();
                        
                        if (lastMessage) {
                            // Lấy snippet từ message
                            if (lastMessage.message || lastMessage.original_message) {
                                const messageText = lastMessage.message || lastMessage.original_message || '';
                                // Loại bỏ HTML tags nếu có
                                snippet = messageText.replace(/<[^>]*>/g, '').trim() || '';
                            } else if (lastMessage.content?.type === 'text') {
                                snippet = lastMessage.content.content || '';
                            } else if (lastMessage.content?.type === 'images' || lastMessage.attachments?.some(a => a.type === 'image')) {
                                snippet = '[Ảnh]';
                            } else if (lastMessage.content?.type === 'videos' || lastMessage.attachments?.some(a => a.type === 'video')) {
                                snippet = '[Video]';
                            } else if (lastMessage.content?.type === 'files' || lastMessage.attachments?.some(a => a.type === 'file')) {
                                snippet = '[Tệp]';
                            }
                            
                            // Lấy updated_at từ inserted_at của message cuối cùng
                            if (lastMessage.inserted_at) {
                                updatedAt = lastMessage.inserted_at;
                            }
                        }

                        // Lấy thông tin customer từ response
                        // Ưu tiên: customers array > conv_from > messages[0].from
                        let customerId = null;
                        let customerName = null;
                        let customerAvatar = null;
                        let customerFbId = null;
                        
                        // Ưu tiên 1: Lấy từ customers array trong response
                        if (messagesData?.customers && Array.isArray(messagesData.customers) && messagesData.customers.length > 0) {
                            const firstCustomer = messagesData.customers[0];
                            customerId = firstCustomer.id || firstCustomer.fb_id || null;
                            customerName = firstCustomer.name || null;
                            customerAvatar = firstCustomer.avatar_url || null;
                            customerFbId = firstCustomer.fb_id || firstCustomer.id || null;
                        }
                        
                        // Ưu tiên 2: Lấy từ conv_from
                        if (!customerId && messagesData?.conv_from) {
                            customerId = messagesData.conv_from.id || null;
                            customerName = messagesData.conv_from.name || null;
                            customerAvatar = messagesData.conv_from.avatar_url || null;
                            customerFbId = messagesData.conv_from.id || null;
                        }
                        
                        // Ưu tiên 3: Lấy từ lastMessage.from
                        if (!customerId && lastMessage?.from) {
                            customerId = lastMessage.from.id || null;
                            customerName = lastMessage.from.name || null;
                            customerAvatar = lastMessage.from.avatar_url || null;
                            customerFbId = lastMessage.from.id || null;
                        }
                        
                        // Fallback: Tìm từ bất kỳ message nào
                        if (!customerId && messages.length > 0) {
                            const msgWithFrom = messages.find(m => m.from && m.from.id);
                            if (msgWithFrom?.from) {
                                customerId = msgWithFrom.from.id;
                                customerName = msgWithFrom.from.name;
                                customerAvatar = msgWithFrom.from.avatar_url;
                                customerFbId = msgWithFrom.from.id;
                            }
                        }

                        // Xác định loại hội thoại dựa trên messages:
                        // - Nếu có bất kỳ message.type === 'COMMENT' hoặc 'POST_COMMENT' => COMMENT
                        // - Ngược lại => INBOX
                        let conversationType = 'INBOX';
                        if (messages.some(m => m?.type === 'COMMENT' || m?.type === 'POST_COMMENT')) {
                            conversationType = 'COMMENT';
                        }

                        // Tạo conversation object theo format chuẩn
                        const conversationObj = {
                            id: conversationIdFromResponse,
                            conversation_id: conversationIdFromResponse,
                            type: conversationType,
                            snippet: snippet,
                            updated_at: updatedAt,
                            from: customerId ? {
                                id: customerFbId || customerId,
                                name: customerName || 'Khách hàng ẩn',
                                avatar_url: customerAvatar
                            } : null,
                            from_psid: customerFbId || customerId || null,
                            customers: customerId ? [{
                                name: customerName || 'Khách hàng ẩn',
                                id: customerId,
                                fb_id: customerFbId || customerId,
                                avatar_url: customerAvatar
                            }] : [],
                        };
                        
                        console.log(`✅ [getConversationsFromIds] Created conversation object for ${id}:`, conversationObj);
                        return conversationObj;
                    } else {
                        console.warn(`⚠️ [getConversationsFromIds] Failed to fetch conversation ${id}:`, messagesResponse.status, messagesResponse.statusText);
                        return {
                            id: id,
                            conversation_id: id,
                            type: 'INBOX',
                            snippet: '',
                            updated_at: new Date().toISOString(),
                            from: null,
                            from_psid: null,
                            customers: [],
                        };
                    }
                } catch (error) {
                    console.error(`❌ [getConversationsFromIds] Error fetching conversation ${id}:`, error);
                    return {
                        id: id,
                        conversation_id: id,
                        type: 'INBOX',
                        snippet: '',
                        updated_at: new Date().toISOString(),
                        from: null,
                        from_psid: null,
                        customers: [],
                    };
                }
            })
        );

        const allConversations = [...foundConversations, ...missingConversations];
        console.log(`✅ [getConversationsFromIds] Total conversations loaded: ${allConversations.length} (${foundConversations.length} existing + ${missingConversations.length} new)`);
        return allConversations;
    } catch (error) {
        console.error(`Error fetching conversations from ids:`, error);
        return [];
    }
}
