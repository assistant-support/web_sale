// app/api/pancake/tags/sync/route.js
import { NextResponse } from 'next/server';
import connectDB from '@/config/connectDB';
import Labelfb from '@/models/label.model';

// Cache sync theo pageId để tránh gọi Pancake + bulkWrite liên tục khi user đổi page / reload
const SYNC_COOLDOWN_MS = 2 * 60 * 1000; // 2 phút
const lastSyncByPageId = new Map(); // pageId -> timestamp

/**
 * POST /api/pancake/tags/sync
 * Sync tags từ Pancake API vào MongoDB (lưu vào bảng Labelfb)
 * Body: { pageId: string, accessToken: string }
 * Nếu cùng pageId vừa sync trong SYNC_COOLDOWN_MS thì bỏ qua (trả về success, synced: 0).
 */
export async function POST(request) {
    try {
        const body = await request.json();
        const { pageId, accessToken } = body;

        if (!pageId || !accessToken) {
            return NextResponse.json(
                { success: false, error: 'Missing pageId or accessToken' },
                { status: 400 }
            );
        }

        const now = Date.now();
        const last = lastSyncByPageId.get(pageId) || 0;
        if (now - last < SYNC_COOLDOWN_MS) {
            if (process.env.NODE_ENV === 'development') {
                console.log('[PancakeTag][sync] Skip (cooldown) pageId=', pageId);
            }
            return NextResponse.json({
                success: true,
                message: 'Sync skipped (cooldown)',
                synced: 0,
                total: 0,
            });
        }
        lastSyncByPageId.set(pageId, now);

        await connectDB();

        // Gọi Pancake API để lấy settings (chứa tags)
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
        
        // Lấy tags từ settings.tags (không phải data.tags trực tiếp)
        const settings = data?.settings || data;
        const tags = Array.isArray(settings?.tags) ? settings.tags : [];

        if (tags.length === 0) {
            return NextResponse.json({
                success: true,
                message: 'No tags found',
                synced: 0,
            });
        }

        if (process.env.NODE_ENV === 'development') {
            console.log('[PancakeTag][sync] Starting sync for pageId:', pageId, 'tags count:', tags.length);
        }

        // ✅ THEO TÀI LIỆU labelPancakeAPI.md: Lưu cả tagId và tagIndex
        // tagIndex = vị trí trong array (Pancake dùng index để filter, không phải tagId)
        const bulkOps = [];
        let syncedCount = 0;

        // ✅ Duyệt mảng và lấy index (vị trí trong array)
        for (let index = 0; index < tags.length; index++) {
            const tag = tags[index];
            
            if (!tag.id || !tag.text) {
                console.warn('[PancakeTag] Skipping invalid tag:', tag);
                continue;
            }

            // Chuẩn hóa dữ liệu từ Pancake để lưu vào Labelfb
            // QUAN TRỌNG: tagId phải là String (Pancake trả về String, không phải Number)
            const tagIdStr = String(tag.id);
            const pageIdStr = String(pageId);
            
            const normalizedTag = {
                from: 'pancake',
                pageId: pageIdStr,
                tagId: tagIdStr, // String, không phải Number
                tagIndex: index, // ✅ QUAN TRỌNG: Vị trí trong array (Pancake dùng index để filter)
                name: String(tag.text || '').trim(),
                color: String(tag.color || '#000000').trim(),
                lightenColor: String(tag.lighten_color || tag.lightenColor || '').trim(),
                isLeadEvent: Boolean(tag.is_lead_event || tag.isLeadEvent || false),
                customer: {}, // Giữ nguyên structure
                lastSyncedAt: new Date(), // Cập nhật thời gian sync
            };

            // Tìm hoặc tạo tag trong Labelfb (không log từng tag để tránh flood log khi load page)
            bulkOps.push({
                updateOne: {
                    filter: { 
                        pageId: pageIdStr, 
                        tagId: tagIdStr, 
                        from: 'pancake' 
                    },
                    update: {
                        $set: normalizedTag,
                        $setOnInsert: { createdAt: new Date() },
                    },
                    upsert: true,
                },
            });
            syncedCount++;
        }

        if (bulkOps.length > 0) {
            try {
                const result = await Labelfb.bulkWrite(bulkOps, { ordered: false });
                if (process.env.NODE_ENV === 'development') {
                    console.log('[PancakeTag][sync] OK pageId=' + pageId, 'matched=' + result.matchedCount, 'modified=' + result.modifiedCount, 'upserted=' + result.upsertedCount);
                }
            } catch (bulkError) {
                // E11000 = duplicate key (DB có index name_1 unique toàn cục → tag trùng tên với page khác bị lỗi)
                // Fallback: ghi từng tag một, bỏ qua tag bị duplicate để page vẫn có tags còn lại
                if (bulkError.code === 11000) {
                    if (process.env.NODE_ENV === 'development') {
                        console.warn('[PancakeTag][sync] BulkWrite duplicate key, fallback: sync từng tag cho pageId=', pageId);
                    }
                    let saved = 0;
                    let skipped = 0;
                    for (const op of bulkOps) {
                        const filter = op.updateOne.filter;
                        const update = op.updateOne.update;
                        try {
                            await Labelfb.findOneAndUpdate(
                                filter,
                                update,
                                { upsert: true, new: true }
                            );
                            saved++;
                        } catch (err) {
                            if (err.code === 11000) {
                                skipped++;
                            } else {
                                throw err;
                            }
                        }
                    }
                    if (process.env.NODE_ENV === 'development') {
                        console.log('[PancakeTag][sync] Fallback done pageId=' + pageId, 'saved=' + saved, 'skipped(dup)=' + skipped);
                    }
                } else {
                    console.error('[PancakeTag][sync] BulkWrite error:', bulkError.message);
                    throw bulkError;
                }
            }
        }

        return NextResponse.json({
            success: true,
            message: `Synced ${syncedCount} tags`,
            synced: syncedCount,
            total: tags.length,
        });
    } catch (error) {
        console.error('[PancakeTag][sync] Error:', error);
        console.error('[PancakeTag][sync] Error stack:', error.stack);
        console.error('[PancakeTag][sync] Error details:', {
            name: error.name,
            message: error.message,
            code: error.code,
            keyPattern: error.keyPattern,
            keyValue: error.keyValue,
        });
        return NextResponse.json(
            { 
                success: false, 
                error: error.message || 'Internal server error',
                details: process.env.NODE_ENV === 'development' ? {
                    name: error.name,
                    code: error.code,
                    keyPattern: error.keyPattern,
                    keyValue: error.keyValue,
                } : undefined
            },
            { status: 500 }
        );
    }
}
