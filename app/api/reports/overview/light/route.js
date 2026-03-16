import { NextResponse } from 'next/server';
import connectDB from '@/config/connectDB';
import { service_data } from '@/data/services/wraperdata.db';
import { form_data, message_sources_data } from '@/data/form_database/wraperdata.db';
import ConversationLeadStatus from '@/models/conversationLeadStatus.model';

/**
 * Dữ liệu nhẹ cho Báo cáo tổng quan: services, sources, messageSources, conversations.
 * Gọi trước để hiển thị giao diện + bộ lọc ngay, sau đó load heavy (customers, appointments).
 */
export async function GET() {
    try {
        await connectDB();

        const [services, sources, messageSources, conversationsRaw] = await Promise.all([
            service_data(),
            form_data(),
            message_sources_data(),
            ConversationLeadStatus.find({})
                .select('name pageDisplayName status createdAt updatedAt')
                .sort({ updatedAt: -1 })
                .lean(),
        ]);

        const conversations = (conversationsRaw || []).map((c) => ({
            _id: c._id ? String(c._id) : undefined,
            name: c.name ?? '',
            pageDisplayName: c.pageDisplayName ?? '',
            status: c.status ?? '',
            createdAt: c.createdAt instanceof Date ? c.createdAt.toISOString() : c.createdAt ?? null,
            updatedAt: c.updatedAt instanceof Date ? c.updatedAt.toISOString() : c.updatedAt ?? null,
        }));

        return NextResponse.json({
            success: true,
            data: {
                services: services || [],
                sources: sources || [],
                messageSources: messageSources || [],
                conversations: conversations || [],
            },
        });
    } catch (error) {
        console.error('[API reports/overview/light]', error);
        return NextResponse.json(
            { success: false, error: error?.message || 'Lỗi khi tải dữ liệu.' },
            { status: 500 }
        );
    }
}
