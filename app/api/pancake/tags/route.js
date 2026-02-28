// app/api/pancake/tags/route.js
import { NextResponse } from 'next/server';
import connectDB from '@/config/connectDB';
import Labelfb from '@/models/label.model';

/** Chuẩn hóa tag từ Pancake API sang format dùng chung (tagId, text, color). */
function normalizePancakeTag(tag) {
    if (!tag?.id || tag?.text == null) return null;
    return {
        tagId: String(tag.id),
        text: String(tag.text || '').trim(),
        color: String(tag.color || '#000000').trim(),
    };
}

/**
 * GET /api/pancake/tags?pageId=xxx
 * Lấy danh sách tags: ưu tiên từ DB (Labelfb); nếu DB trả 0 và có header X-Pancake-Access-Token thì gọi Pancake API trực tiếp để hiển thị.
 */
export async function GET(request) {
    try {
        const { searchParams } = new URL(request.url);
        const pageId = searchParams.get('pageId');
        const accessToken = request.headers.get('X-Pancake-Access-Token') || request.headers.get('x-pancake-access-token');

        if (!pageId) {
            return NextResponse.json(
                { success: false, error: 'Missing pageId parameter' },
                { status: 400 }
            );
        }

        const pageIdStr = String(pageId);
        let tags = [];

        // 1) Lấy từ DB trước
        await connectDB();
        const dbTags = await Labelfb.find({
            from: 'pancake',
            pageId: pageIdStr,
        })
            .sort({ name: 1 })
            .lean();

        if (dbTags.length > 0) {
            tags = dbTags.map(tag => ({
                tagId: String(tag.tagId),
                text: tag.name,
                color: tag.color,
            }));
            if (process.env.NODE_ENV === 'development') {
                console.log('[PancakeTag][get] Found', tags.length, 'tags from DB for pageId:', pageId);
            }
            return NextResponse.json({ success: true, data: tags });
        }

        // 2) DB trống: nếu có token thì gọi Pancake API trực tiếp để hiển thị thẻ trên hội thoại
        if (accessToken?.trim()) {
            try {
                const settingsUrl = `https://pancake.vn/api/v1/pages/${pageIdStr}/settings?access_token=${accessToken.trim()}`;
                const response = await fetch(settingsUrl, { cache: 'no-store' });
                if (response.ok) {
                    const data = await response.json();
                    const settings = data?.settings || data;
                    const rawTags = Array.isArray(settings?.tags) ? settings.tags : [];
                    const list = rawTags.map(normalizePancakeTag).filter(Boolean);
                    if (list.length > 0) {
                        if (process.env.NODE_ENV === 'development') {
                            console.log('[PancakeTag][get] Found', list.length, 'tags from Pancake API (fallback) for pageId:', pageId);
                        }
                        return NextResponse.json({ success: true, data: list, fromApi: true });
                    }
                }
            } catch (apiErr) {
                if (process.env.NODE_ENV === 'development') {
                    console.warn('[PancakeTag][get] Pancake API fallback failed:', apiErr?.message);
                }
            }
        }

        if (process.env.NODE_ENV === 'development') {
            console.log('[PancakeTag][get] Found 0 tags for pageId:', pageId);
        }
        return NextResponse.json({ success: true, data: [] });
    } catch (error) {
        console.error('[PancakeTag][get] Error:', error);
        return NextResponse.json(
            { success: false, error: error.message || 'Internal server error' },
            { status: 500 }
        );
    }
}


