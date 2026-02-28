import { getCustomersForReports } from "@/data/customers/handledata.db";
import { appointment_data_all } from "@/data/appointment_db/wraperdata.db";
import { service_data } from "@/data/services/wraperdata.db";
import { form_data, message_sources_data } from '@/data/form_database/wraperdata.db';
import connectDB from '@/config/connectDB';
import ConversationLeadStatus from '@/models/conversationLeadStatus.model';
import OverviewReportClient from "./overview-client";

export default async function OverviewReportPage() {
    await connectDB();

    const [customers, appointments, services, sources, messageSources] = await Promise.all([
        getCustomersForReports(),
        appointment_data_all(),
        service_data(),
        form_data(),
        message_sources_data(),
    ]);

    const conversationsRaw = await ConversationLeadStatus.find({})
        .select('name pageDisplayName status createdAt updatedAt')
        .sort({ updatedAt: -1 })
        .lean();

    // Chuyển đổi về plain JSON-safe object cho Client Component
    const conversations = (conversationsRaw || []).map((c) => ({
        _id: c._id ? String(c._id) : undefined,
        name: c.name ?? '',
        pageDisplayName: c.pageDisplayName ?? '',
        status: c.status ?? '',
        createdAt: c.createdAt instanceof Date ? c.createdAt.toISOString() : c.createdAt ?? null,
        updatedAt: c.updatedAt instanceof Date ? c.updatedAt.toISOString() : c.updatedAt ?? null,
    }));

    return (
        <OverviewReportClient
            customers={customers || []}
            appointments={appointments || []}
            services={services || []}
            sources={sources || []}
            messageSources={messageSources || []}
            conversations={conversations || []}
        />
    );
}
