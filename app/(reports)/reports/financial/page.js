import { customer_data } from "@/data/customers/wraperdata.db";
import { service_data } from "@/data/services/wraperdata.db";
import { form_data, message_sources_data } from '@/data/form_database/wraperdata.db';
import FinancialReportClient from "./financial-client";

export default async function FinancialReportPage() {
    const [customers, services, sources, messageSources] = await Promise.all([
        customer_data(),
        service_data(),
        form_data(),
        message_sources_data(),
    ]);

    return (
        <FinancialReportClient
            customers={customers || []}
            services={services || []}
            sources={sources || []}
            messageSources={messageSources || []}
        />
    );
}
