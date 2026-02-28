// app/api/conversation-lead-status/route.js
import { NextResponse } from 'next/server';
import connectDB from '@/config/connectDB';
import ConversationLeadStatus from '@/models/conversationLeadStatus.model';

/**
 * POST /api/conversation-lead-status
 * Lưu hoặc cập nhật lead status cho conversation
 * Body: { conversationId, pageId, status, note?, labelId?, name?, pageDisplayName?, idcustomers? }
 */
export async function POST(request) {
    try {
        await connectDB();

        const body = await request.json();
        const { conversationId, pageId, status, note, labelId, name, pageDisplayName, idcustomers } = body;

        if (!conversationId || !pageId || !status) {
            return NextResponse.json(
                { success: false, error: 'Missing required fields: conversationId, pageId, status' },
                { status: 400 }
            );
        }

        if (!['LEAD', 'NOT_LEAD'].includes(status)) {
            return NextResponse.json(
                { success: false, error: 'Invalid status. Must be LEAD or NOT_LEAD' },
                { status: 400 }
            );
        }

        // Upsert lead status (name = tên khách, pageDisplayName = "Tin nhắn - platform - page", idcustomers = id khách hội thoại)
        const leadStatus = await ConversationLeadStatus.findOneAndUpdate(
            { conversationId, pageId },
            {
                conversationId,
                pageId,
                status,
                note: status === 'NOT_LEAD' ? (note || null) : null,
                labelId: labelId || null,
                name: name != null ? String(name).trim() || null : null,
                pageDisplayName: pageDisplayName != null ? String(pageDisplayName).trim() || null : null,
                idcustomers: idcustomers != null ? String(idcustomers).trim() || null : null,
            },
            { upsert: true, new: true }
        );

        return NextResponse.json({
            success: true,
            data: leadStatus,
        });
    } catch (error) {
        console.error('[ConversationLeadStatus] Error:', error);
        return NextResponse.json(
            { success: false, error: error.message || 'Internal server error' },
            { status: 500 }
        );
    }
}

/**
 * GET /api/conversation-lead-status
 * - Mode 1: ?conversationIds=id1,id2,id3&pageId=xxx → trả về map status theo conversationId
 * - Mode 2: ?leadStatusLabelId=xxx → trả về danh sách hội thoại có gán thẻ đó (để hiển thị / mở hội thoại)
 */
export async function GET(request) {
    try {
        await connectDB();

        const { searchParams } = new URL(request.url);
        const conversationIds = searchParams.get('conversationIds')?.split(',').filter(Boolean) || [];
        const pageId = searchParams.get('pageId');
        const leadStatusLabelId = searchParams.get('leadStatusLabelId');

        // Mode 2: Lấy danh sách hội thoại theo thẻ LEAD/NOT_LEAD (pageId + conversationId để gọi/mở hội thoại)
        if (leadStatusLabelId) {
            const mongoose = (await import('mongoose')).default;
            if (!mongoose.Types.ObjectId.isValid(leadStatusLabelId)) {
                return NextResponse.json(
                    { success: false, error: 'Invalid leadStatusLabelId' },
                    { status: 400 }
                );
            }
            const list = await ConversationLeadStatus.find({
                labelId: new mongoose.Types.ObjectId(leadStatusLabelId),
            })
                .select('conversationId pageId name pageDisplayName status note idcustomers')
                .sort({ updatedAt: -1 })
                .lean();
            return NextResponse.json({
                success: true,
                data: list,
            });
        }

        // Mode 1: Map status theo conversationIds + pageId
        if (conversationIds.length === 0 || !pageId) {
            return NextResponse.json(
                { success: false, error: 'Missing conversationIds or pageId (or leadStatusLabelId)' },
                { status: 400 }
            );
        }

        const leadStatuses = await ConversationLeadStatus.find({
            conversationId: { $in: conversationIds },
            pageId,
        }).lean();

        const statusMap = {};
        leadStatuses.forEach((s) => {
            statusMap[s.conversationId] = {
                status: s.status,
                note: s.note,
                name: s.name ?? undefined,
                pageDisplayName: s.pageDisplayName ?? undefined,
                labelId: s.labelId ?? undefined,
            };
        });

        return NextResponse.json({
            success: true,
            data: statusMap,
        });
    } catch (error) {
        console.error('[ConversationLeadStatus] Error:', error);
        return NextResponse.json(
            { success: false, error: error.message || 'Internal server error' },
            { status: 500 }
        );
    }
}

/**
 * DELETE /api/conversation-lead-status
 * Xóa lead status của conversation
 * Query: ?conversationId=xxx&pageId=xxx
 */
export async function DELETE(request) {
    try {
        await connectDB();

        const { searchParams } = new URL(request.url);
        const conversationId = searchParams.get('conversationId');
        const pageId = searchParams.get('pageId');

        if (!conversationId || !pageId) {
            return NextResponse.json(
                { success: false, error: 'Missing conversationId or pageId' },
                { status: 400 }
            );
        }

        await ConversationLeadStatus.deleteOne({ conversationId, pageId });

        return NextResponse.json({
            success: true,
            message: 'Lead status deleted',
        });
    } catch (error) {
        console.error('[ConversationLeadStatus] Error:', error);
        return NextResponse.json(
            { success: false, error: error.message || 'Internal server error' },
            { status: 500 }
        );
    }
}

