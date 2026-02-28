import { form_data, message_sources_data } from '@/data/form_database/wraperdata.db';
import MarketingReportClient from "./marketing-client";

export default async function MarketingReportPage() {
    const [sources, messageSources] = await Promise.all([
        form_data(),
        message_sources_data(),
    ]);

    return (
        <MarketingReportClient
            sources={sources || []}
            messageSources={messageSources || []}
        />
    );
}
