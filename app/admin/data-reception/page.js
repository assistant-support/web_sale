import { customer_data } from "@/data/customers/wraperdata.db";
import DashboardClient from "./dashboard-client";
import { Navbar } from "../nav";
import { service_data } from "@/data/services/wraperdata.db";
import { form_data, message_sources_data } from '@/data/form_database/wraperdata.db';

export default async function AdminPage() {
    const [data, service, sources, messageSources] = await Promise.all([
        customer_data(),
        service_data(),
        form_data(),
        message_sources_data(),
    ]);

    return (
        <>
            <Navbar />
            <DashboardClient initialData={data} service={service} sources={sources} messageSources={messageSources} />
        </>
    );
}