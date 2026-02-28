// app/api/pancake/conversations/by-label/route.js
import { NextResponse } from 'next/server';
import connectDB from '@/config/connectDB';
import Labelfb from '@/models/label.model';
import ConversationsPancake from '@/models/conversationsPancake.model';
import ConversationLabel from '@/models/conversationLabel.model';
import crypto from 'crypto';

/**
 * GET /api/pancake/conversations/by-label
 * 
 * Lấy conversations theo label (tag) từ Pancake
 * Logic:
 * 1. Kiểm tra cache (lastSyncedAt < 3 phút) → query DB
 * 2. Nếu cache hết hạn hoặc forceRefresh → gọi Pancake API
 * 3. Sync DB và trả về data
 * 
 * Query params:
 * - pageId: ID của page
 * - labelId: ID của label (tag) từ Pancake
 * - cursor: cursor để pagination (optional)
 * - limit: số lượng conversations (default: 100)
 * - forceRefresh: có gọi Pancake lại không (default: false)
 * - accessToken: access token (optional, nếu không có thì dùng từ pageConfig)
 */
export async function GET(request) {
    try {
        await connectDB();

        const { searchParams } = new URL(request.url);
        const pageId = String(searchParams.get('pageId') || '');
        const labelId = String(searchParams.get('labelId') || '');
        const cursor = searchParams.get('cursor') || null;
        const limit = parseInt(searchParams.get('limit') || '100', 10);
        const forceRefresh = searchParams.get('forceRefresh') === 'true';
        const accessToken = searchParams.get('accessToken') || '';

        if (!pageId || !labelId) {
            return NextResponse.json(
                { success: false, error: 'Missing pageId or labelId parameter' },
                { status: 400 }
            );
        }

        // 1️⃣ Lấy label: ưu tiên DB; nếu không có (tag chỉ hiển thị từ Pancake API) thì lấy tagIndex từ Pancake settings
        let label = await Labelfb.findOne({
            from: 'pancake',
            pageId: pageId,
            tagId: labelId,
        }).lean();

        if (!label && accessToken) {
            // Fallback: tag chưa sync vào DB (vd. page bị duplicate key) → lấy tagIndex trực tiếp từ Pancake API
            try {
                const settingsUrl = `https://pancake.vn/api/v1/pages/${pageId}/settings?access_token=${accessToken}`;
                const settingsRes = await fetch(settingsUrl, { cache: 'no-store' });
                if (settingsRes.ok) {
                    const data = await settingsRes.json();
                    const settings = data?.settings || data;
                    const tags = Array.isArray(settings?.tags) ? settings.tags : [];
                    const index = tags.findIndex((t) => String(t?.id) === labelId);
                    if (index !== -1) {
                        const tag = tags[index];
                        label = {
                            _id: null,
                            tagId: labelId,
                            tagIndex: index,
                            name: String(tag?.text || '').trim(),
                        };
                        console.log(`[ConversationsByLabel] Using tag from Pancake API (no DB): tagId=${labelId}, tagIndex=${index}`);
                    }
                }
            } catch (e) {
                if (process.env.NODE_ENV === 'development') {
                    console.warn('[ConversationsByLabel] Fallback Pancake settings failed:', e?.message);
                }
            }
        }

        if (!label) {
            return NextResponse.json(
                { success: false, error: 'Label not found' },
                { status: 404 }
            );
        }

        // ✅ QUAN TRỌNG: Kiểm tra tagIndex có tồn tại không
        // Nếu thiếu tagIndex → gọi sync tags API để lấy tagIndex
        if (label.tagIndex === null || label.tagIndex === undefined) {
            console.warn(`[ConversationsByLabel] ⚠️ Label ${labelId} missing tagIndex, forcing sync tags first`);
            try {
                // Gọi sync tags API để lấy tagIndex
                const syncUrl = `${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/api/pancake/tags/sync`;
                const syncResponse = await fetch(syncUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ pageId, accessToken }),
                });
                
                if (syncResponse.ok) {
                    // Query lại label để lấy tagIndex mới
                    const updatedLabel = await Labelfb.findOne({
                        from: 'pancake',
                        pageId: pageId,
                        tagId: labelId,
                    }).lean();
                    
                    if (updatedLabel?.tagIndex !== null && updatedLabel?.tagIndex !== undefined) {
                        label.tagIndex = updatedLabel.tagIndex;
                        label.lastSyncedAt = updatedLabel.lastSyncedAt;
                        console.log(`[ConversationsByLabel] ✅ Synced tags, got tagIndex ${label.tagIndex} for tagId ${labelId}`);
                    } else {
                        return NextResponse.json(
                            { success: false, error: 'Label tagIndex not found after sync (tag may be deleted in Pancake)' },
                            { status: 404 }
                        );
                    }
                } else {
                    const errorText = await syncResponse.text().catch(() => '');
                    console.error(`[ConversationsByLabel] Failed to sync tags: ${syncResponse.status} - ${errorText}`);
                    return NextResponse.json(
                        { success: false, error: 'Failed to sync tags' },
                        { status: syncResponse.status }
                    );
                }
            } catch (syncError) {
                console.error('[ConversationsByLabel] Error syncing tags:', syncError);
                return NextResponse.json(
                    { success: false, error: 'Failed to sync label settings' },
                    { status: 500 }
                );
            }
        }

        // ✅ THEO TÀI LIỆU labelPancakeAPI.md: LUÔN gọi Pancake API với tagIndex để filter
        // Không dùng cache từ DB vì có thể thiếu conversations chưa được sync
        // Chỉ dùng cache khi có cursor (pagination tiếp tục)
        const shouldCallPancake = true; // Luôn gọi Pancake API để đảm bảo đầy đủ
        
        // 2️⃣ NẾU CÓ CURSOR (pagination tiếp tục) → GỌI PANCAKE API NGAY
        // Nếu không có cursor và không force refresh → có thể dùng cache (nhưng hiện tại bỏ qua để đảm bảo đầy đủ)

        // 3️⃣ GỌI PANCAKE API
        if (!accessToken) {
            return NextResponse.json(
                { success: false, error: 'Missing accessToken' },
                { status: 400 }
            );
        }

        // ✅ THEO TÀI LIỆU labelPancakeAPI.md: LUÔN dùng tagIndex để gọi Pancake API
        const tagIndex = label.tagIndex;
        if (tagIndex === null || tagIndex === undefined) {
            return NextResponse.json(
                { success: false, error: 'Label tagIndex not found' },
                { status: 404 }
            );
        }

        console.log(`[ConversationsByLabel] 🎯 Calling Pancake API with tagIndex ${tagIndex} (NOT tagId ${labelId}) for label: ${label.name}`);

        // Gọi Pancake API với cursor pagination
        let allConversations = [];
        let nextCursor = cursor;
        let pageCount = 0;
        const maxPages = 50; // Giới hạn để tránh vòng lặp vô hạn

        do {
            // ✅ QUAN TRỌNG: Dùng tagIndex (KHÔNG PHẢI tagId) để filter
            // Pancake API dùng index trong array settings.tags, không phải tag.id
            let conversationsUrl = `https://pancake.vn/api/v1/pages/${pageId}/conversations?access_token=${accessToken}&unread_first=true&mode=NONE&tags=[${tagIndex}]&except_tags=[]&cursor_mode=true&from_platform=web`;

            if (nextCursor) {
                conversationsUrl += `&cursor=${encodeURIComponent(nextCursor)}`;
            }

            console.log(`[ConversationsByLabel] 📡 Fetching page ${pageCount + 1} with tagIndex=${tagIndex} (tagId=${labelId})${nextCursor ? `, cursor: ${nextCursor.substring(0, 20)}...` : ''}`);
            console.log(`[ConversationsByLabel] 🔗 URL: ${conversationsUrl.replace(/access_token=[^&]+/, 'access_token=***')}`);

            const response = await fetch(conversationsUrl, { cache: 'no-store' });

            if (!response.ok) {
                const errorText = await response.text().catch(() => '');
                if (pageCount === 0) {
                    return NextResponse.json(
                        { success: false, error: `Pancake API Error ${response.status}: ${errorText}` },
                        { status: response.status }
                    );
                }
                console.warn(`[ConversationsByLabel] Error on page ${pageCount + 1}, stopping pagination`);
                break;
            }

            const data = await response.json();
            const conversations = Array.isArray(data?.conversations) ? data.conversations : [];

            nextCursor = data?.nextCursor || data?.next_cursor || data?.cursor || null;

            if (pageCount === 0) {
                console.log('[ConversationsByLabel] Response structure:', {
                    hasConversations: Array.isArray(data?.conversations),
                    conversationsCount: conversations.length,
                    nextCursor: nextCursor,
                });
            }

            console.log(`[ConversationsByLabel] Page ${pageCount + 1}: Got ${conversations.length} conversations${nextCursor ? `, has nextCursor` : ', no more pages'}`);

            allConversations.push(...conversations);
            pageCount++;

            // Nếu có cursor từ request, chỉ lấy 1 page
            if (cursor || pageCount >= maxPages) {
                break;
            }
        } while (nextCursor);

        console.log(`[ConversationsByLabel] Total loaded ${allConversations.length} conversations from ${pageCount} page(s)`);

        // ✅ THEO TÀI LIỆU labelPancakeAPI.md: Kiểm tra kết quả bất thường
        // Nếu trả về 0 conversations hoặc số lượng quá ít → có thể tagIndex đã thay đổi
        const isAbnormalResult = allConversations.length === 0 && !forceRefresh;
        
        if (isAbnormalResult) {
            console.warn(`[ConversationsByLabel] ⚠️ Abnormal result: 0 conversations for tagIndex ${tagIndex} (tagId: ${labelId}). Force syncing settings...`);
            
            // Force sync settings để cập nhật tagIndex
            try {
                // Gọi Pancake API để lấy settings
                const settingsUrl = `https://pancake.vn/api/v1/pages/${pageId}/settings?access_token=${accessToken}`;
                const settingsResponse = await fetch(settingsUrl, { cache: 'no-store' });
                
                if (settingsResponse.ok) {
                    const settingsData = await settingsResponse.json();
                    const settings = settingsData?.settings || settingsData;
                    const tags = Array.isArray(settings?.tags) ? settings.tags : [];
                    
                    // Tìm tag trong array và lấy index
                    const newTagIndex = tags.findIndex((tag) => String(tag.id) === labelId);
                    
                    if (newTagIndex !== -1 && newTagIndex !== tagIndex) {
                        console.log(`[ConversationsByLabel] ✅ TagIndex changed from ${tagIndex} to ${newTagIndex}, retrying filter...`);
                        
                        // Cập nhật tagIndex vào DB (chỉ khi label có trong DB)
                        if (label._id) {
                            await Labelfb.updateOne(
                                { _id: label._id },
                                { $set: { tagIndex: newTagIndex, lastSyncedAt: new Date() } }
                            );
                        } else {
                            label.tagIndex = newTagIndex;
                        }
                        
                        // Retry với tagIndex mới
                        const retryUrl = `https://pancake.vn/api/v1/pages/${pageId}/conversations?access_token=${accessToken}&unread_first=true&mode=NONE&tags=[${newTagIndex}]&except_tags=[]&cursor_mode=true&from_platform=web`;
                        
                        const retryResponse = await fetch(retryUrl, { cache: 'no-store' });
                        if (retryResponse.ok) {
                            const retryData = await retryResponse.json();
                            const retryConversations = Array.isArray(retryData?.conversations) ? retryData.conversations : [];
                            
                            if (retryConversations.length > 0) {
                                console.log(`[ConversationsByLabel] ✅ Retry successful: ${retryConversations.length} conversations found with new tagIndex ${newTagIndex}`);
                                allConversations.push(...retryConversations);
                            }
                        }
                    } else if (newTagIndex === -1) {
                        console.warn(`[ConversationsByLabel] ⚠️ Tag ${labelId} not found in Pancake settings (may be deleted)`);
                    }
                }
            } catch (syncError) {
                console.error('[ConversationsByLabel] Error force syncing settings:', syncError);
            }
        }

        // ✅ QUAN TRỌNG: Không filter lại vì Pancake API đã filter sẵn
        // Nếu Pancake trả về conversation, nghĩa là conversation đó có tag đó
        const filteredConversations = allConversations;
        
        console.log(`[ConversationsByLabel] Using all ${filteredConversations.length} conversations from Pancake (already filtered by Pancake API with tagIndex ${tagIndex})`);

        // 4️⃣ ĐỒNG BỘ DB
        const conversationBulkOps = [];
        const conversationIds = new Set();

        for (const conversation of filteredConversations) {
            const conversationId = String(conversation.id || conversation.conversation_id || '');
            const rawTags = Array.isArray(conversation.tags) ? conversation.tags : [];
            const tagIds = rawTags.map((tagId) => String(tagId));
            const tagHash = tagIds.length > 0
                ? crypto.createHash('md5').update([...tagIds].sort().join(',')).digest('hex')
                : '';

            conversationIds.add(conversationId);

            // Normalize conversation data
            const normalized = {
                conversationId: conversationId,
                pageId: pageId,
                name: conversation.customers?.[0]?.name || conversation.from?.name || '',
                phone: conversation.recent_phone_numbers?.[0]?.phone_number || '',
                tagIds: tagIds,
                lastMessageAt: conversation.updated_at ? new Date(conversation.updated_at) : new Date(),
                snippet: conversation.snippet || '',
                updated_at: conversation.updated_at ? new Date(conversation.updated_at) : new Date(),
                type: conversation.type || 'INBOX',
                customers: conversation.customers || [],
                from: conversation.from || null,
                extraData: {
                    assignee_ids: conversation.assignee_ids || [],
                    message_count: conversation.message_count || 0,
                    unread_count: conversation.unread_count || 0,
                    seen: conversation.seen || false,
                    has_phone: conversation.has_phone || false,
                    thread_id: conversation.thread_id || null,
                    thread_key: conversation.thread_key || null,
                },
            };

            conversationBulkOps.push({
                updateOne: {
                    filter: { conversationId: normalized.conversationId },
                    update: {
                        $set: normalized,
                    },
                    upsert: true,
                },
            });
        }

        if (conversationBulkOps.length > 0) {
            await ConversationsPancake.bulkWrite(conversationBulkOps, { ordered: false });
            console.log(`[ConversationsByLabel] ✅ Upserted ${conversationBulkOps.length} conversations`);
        }

        // 5️⃣ ĐỒNG BỘ BẢNG TRUNG GIAN conversation_labels
        // ✅ QUAN TRỌNG: Pancake API đã filter sẵn, nên conversation này chắc chắn có tag này
        // Ngay cả khi conversation.tags không chứa labelId, vì Pancake đã filter nên conversation này có tag đó
        const labelBulkOps = [];
        for (const conversation of filteredConversations) {
            const conversationId = String(conversation.id || conversation.conversation_id || '');
            if (!conversationId) continue;
            
            const rawTags = Array.isArray(conversation.tags) ? conversation.tags : [];
            const allTagIds = rawTags.map(tagId => String(tagId));
            const hasLabelIdInResponse = allTagIds.includes(labelId);
            
            // ✅ QUAN TRỌNG: Sync tag được filter vào conversation_labels
            // Ngay cả khi tag không có trong response (vì Pancake đã filter nên conversation này có tag đó)
            labelBulkOps.push({
                updateOne: {
                    filter: {
                        conversationId: conversationId,
                        labelId: labelId,
                        pageId: pageId,
                    },
                    update: {
                        $set: {
                            conversationId: conversationId,
                            labelId: labelId,
                            pageId: pageId,
                            updatedAt: new Date(),
                        },
                        $setOnInsert: {
                            createdAt: new Date(),
                        },
                    },
                    upsert: true,
                },
            });
            
            if (!hasLabelIdInResponse) {
                console.log(`[ConversationsByLabel] ⚠️ Conversation ${conversationId} does not have tag ${labelId} in response tags [${allTagIds.join(',')}], but Pancake filtered it, so syncing anyway`);
            }
            
            // ✅ Đồng thời sync TẤT CẢ tags khác của conversation (nếu có trong response)
            for (const tagIdStr of allTagIds) {
                if (tagIdStr === labelId) continue; // Đã sync ở trên
                
                labelBulkOps.push({
                    updateOne: {
                        filter: {
                            conversationId: conversationId,
                            labelId: tagIdStr,
                            pageId: pageId,
                        },
                        update: {
                            $set: {
                                conversationId: conversationId,
                                labelId: tagIdStr,
                                pageId: pageId,
                                updatedAt: new Date(),
                            },
                            $setOnInsert: {
                                createdAt: new Date(),
                            },
                        },
                        upsert: true,
                    },
                });
            }
        }

        if (labelBulkOps.length > 0) {
            await ConversationLabel.bulkWrite(labelBulkOps, { ordered: false });
            console.log(`[ConversationsByLabel] ✅ Synced ${labelBulkOps.length} conversation_labels`);
        }

        // 6️⃣ CẬP NHẬT label.lastSyncedAt (chỉ khi label có trong DB)
        if (label._id) {
            await Labelfb.updateOne(
                { _id: label._id },
                { $set: { lastSyncedAt: new Date() } }
            );
        }

        // 7️⃣ TRẢ VỀ CHO FE
        const enriched = filteredConversations.map((conv) => {
            const rawTags = Array.isArray(conv.tags) ? conv.tags : [];
            return {
                id: conv.id || conv.conversation_id,
                conversationId: conv.id || conv.conversation_id,
                tags: rawTags,
                name: conv.customers?.[0]?.name || conv.from?.name || '',
                snippet: conv.snippet || '',
                updated_at: conv.updated_at || conv.inserted_at,
                customers: conv.customers || [],
                from: conv.from || null,
                type: conv.type || 'INBOX',
                ...conv,
            };
        });

        console.log(`[ConversationsByLabel] 📤 Returning ${enriched.length} conversations to frontend (nextCursor: ${nextCursor ? 'yes' : 'no'})`);

        return NextResponse.json({
            success: true,
            data: enriched,
            nextCursor: nextCursor || null,
            from: 'pancake',
            total: enriched.length,
        });
    } catch (error) {
        console.error('[ConversationsByLabel] Error:', error);
        return NextResponse.json(
            {
                success: false,
                error: error.message || 'Internal server error',
            },
            { status: 500 }
        );
    }
}

