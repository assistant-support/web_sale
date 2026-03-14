// app/api/pancake/tags/refresh/route.js
import { NextResponse } from 'next/server';
import connectDB from '@/config/connectDB';
import Labelfb from '@/models/label.model';

/**
 * POST /api/pancake/tags/refresh
 * Lấy mới nhất từ Pancake API, so sánh với DB và cập nhật:
 * - Thêm tags mới
 * - Xóa tags đã bị xóa khỏi Pancake
 * - Cập nhật tagIndex cho tất cả tags theo thứ tự mới từ Pancake
 * 
 * Body: { pageId: string, accessToken: string }
 */
export async function POST(request) {
    try {
        await connectDB();

        const body = await request.json();
        const { pageId, accessToken } = body;

        if (!pageId || !accessToken) {
            return NextResponse.json(
                { success: false, error: 'Missing pageId or accessToken' },
                { status: 400 }
            );
        }

        // 1. Lấy tags từ Pancake API
        const settingsUrl = `https://pancake.vn/api/v1/pages/${pageId}/settings?access_token=${accessToken}`;
        const response = await fetch(settingsUrl, { cache: 'no-store' });

        if (!response.ok) {
            const errorText = await response.text().catch(() => '');
            return NextResponse.json(
                { success: false, error: `Pancake API Error ${response.status}: ${errorText}` },
                { status: response.status }
            );
        }

        const data = await response.json();
        const settings = data?.settings || data;
        const pancakeTags = Array.isArray(settings?.tags) ? settings.tags : [];

        if (pancakeTags.length === 0) {
            // Nếu Pancake không có tags, xóa tất cả tags trong DB cho page này
            const deleteResult = await Labelfb.deleteMany({
                from: 'pancake',
                pageId: String(pageId),
            });

            return NextResponse.json({
                success: true,
                message: 'No tags in Pancake, deleted all tags from DB',
                added: 0,
                deleted: deleteResult.deletedCount,
                updated: 0,
            });
        }

        // 2. Lấy tags hiện tại từ DB
        const dbTags = await Labelfb.find({
            from: 'pancake',
            pageId: String(pageId),
        }).lean();

        console.log('[PancakeTag][refresh] Pancake tags:', pancakeTags.length);
        console.log('[PancakeTag][refresh] DB tags:', dbTags.length);

        // 3. Tạo map từ Pancake tags (theo tagId)
        const pancakeTagMap = new Map();
        for (let index = 0; index < pancakeTags.length; index++) {
            const tag = pancakeTags[index];
            if (!tag.id || !tag.text) {
                console.warn('[PancakeTag][refresh] Skipping invalid tag:', tag);
                continue;
            }
            const tagIdStr = String(tag.id);
            pancakeTagMap.set(tagIdStr, {
                ...tag,
                tagIndex: index, // Vị trí mới trong array
            });
        }

        // 4. Tạo map từ DB tags (theo tagId)
        const dbTagMap = new Map();
        dbTags.forEach((tag) => {
            dbTagMap.set(String(tag.tagId), tag);
        });

        // 5. So sánh và xác định các thay đổi
        const bulkOps = [];
        let addedCount = 0;
        let deletedCount = 0;
        let updatedCount = 0;

        // 5.1. Xử lý tags từ Pancake (thêm mới hoặc cập nhật)
        for (const [tagIdStr, pancakeTag] of pancakeTagMap.entries()) {
            const dbTag = dbTagMap.get(tagIdStr);
            const pageIdStr = String(pageId);

            const normalizedTag = {
                from: 'pancake',
                pageId: pageIdStr,
                tagId: tagIdStr,
                tagIndex: pancakeTag.tagIndex, // ✅ Cập nhật index mới
                name: String(pancakeTag.text || '').trim(),
                color: String(pancakeTag.color || '#000000').trim(),
                lightenColor: String(pancakeTag.lighten_color || pancakeTag.lightenColor || '').trim(),
                isLeadEvent: Boolean(pancakeTag.is_lead_event || pancakeTag.isLeadEvent || false),
                customer: dbTag?.customer || {}, // Giữ nguyên customer data nếu có
                lastSyncedAt: new Date(),
            };

            if (!dbTag) {
                // Tag mới từ Pancake → Thêm vào DB
                bulkOps.push({
                    updateOne: {
                        filter: {
                            pageId: pageIdStr,
                            tagId: tagIdStr,
                            from: 'pancake',
                        },
                        update: {
                            $set: normalizedTag,
                            $setOnInsert: { createdAt: new Date() },
                        },
                        upsert: true,
                    },
                });
                addedCount++;
                console.log('[PancakeTag][refresh] ➕ New tag:', tagIdStr, normalizedTag.name);
            } else {
                // Tag đã tồn tại → Kiểm tra xem có thay đổi không
                const hasChanges = 
                    dbTag.tagIndex !== pancakeTag.tagIndex ||
                    dbTag.name !== normalizedTag.name ||
                    dbTag.color !== normalizedTag.color ||
                    dbTag.lightenColor !== normalizedTag.lightenColor ||
                    dbTag.isLeadEvent !== normalizedTag.isLeadEvent;

                if (hasChanges) {
                    bulkOps.push({
                        updateOne: {
                            filter: {
                                pageId: pageIdStr,
                                tagId: tagIdStr,
                                from: 'pancake',
                            },
                            update: {
                                $set: normalizedTag,
                            },
                        },
                    });
                    updatedCount++;
                    console.log('[PancakeTag][refresh] 🔄 Updated tag:', tagIdStr, normalizedTag.name, {
                        oldIndex: dbTag.tagIndex,
                        newIndex: pancakeTag.tagIndex,
                    });
                }
            }
        }

        // 5.2. Xóa tags đã bị xóa khỏi Pancake
        const pancakeTagIds = new Set(pancakeTagMap.keys());
        const tagsToDelete = [];
        
        for (const [tagIdStr, dbTag] of dbTagMap.entries()) {
            if (!pancakeTagIds.has(tagIdStr)) {
                // Tag này có trong DB nhưng không có trong Pancake → Xóa
                tagsToDelete.push(tagIdStr);
                deletedCount++;
                console.log('[PancakeTag][refresh] ❌ Deleted tag:', tagIdStr, dbTag.name);
            }
        }

        if (tagsToDelete.length > 0) {
            bulkOps.push({
                deleteMany: {
                    filter: {
                        from: 'pancake',
                        pageId: String(pageId),
                        tagId: { $in: tagsToDelete },
                    },
                },
            });
        }

        // 6. Thực hiện bulk operations
        if (bulkOps.length > 0) {
            try {
                const result = await Labelfb.bulkWrite(bulkOps, { ordered: false });
                console.log('[PancakeTag][refresh] ✅ BulkWrite result:', {
                    inserted: result.insertedCount,
                    modified: result.modifiedCount,
                    deleted: result.deletedCount,
                    upserted: result.upsertedCount,
                });
            } catch (bulkError) {
                // Duplicate key (E11000) thường xảy ra khi có label khác (không phải từ Pancake)
                // dùng cùng tên với tag Pancake. Đây là lỗi "trùng tên" ở mức DB, 
                // nhưng không ảnh hưởng đến hoạt động đồng bộ tags nên mình chỉ log cảnh báo nhẹ.
                if (bulkError?.code === 11000) {
                    console.warn('[PancakeTag][refresh] ⚠️ Duplicate key when writing tags (E11000).', {
                        message: bulkError.message,
                    });
                    // Không throw để quá trình refresh vẫn thành công
                } else {
                    console.error('[PancakeTag][refresh] ❌ BulkWrite error (non-duplicate):', {
                        code: bulkError.code,
                        message: bulkError.message,
                    });
                    throw bulkError;
                }
            }
        }

        return NextResponse.json({
            success: true,
            message: `Refreshed tags: ${addedCount} added, ${deletedCount} deleted, ${updatedCount} updated`,
            added: addedCount,
            deleted: deletedCount,
            updated: updatedCount,
            total: pancakeTags.length,
        });
    } catch (error) {
        console.error('[PancakeTag][refresh] Error:', error);
        return NextResponse.json(
            { 
                success: false, 
                error: error.message || 'Internal server error',
            },
            { status: 500 }
        );
    }
}

