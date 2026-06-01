import { customer_data } from "@/data/customers/wraperdata.db";
import DashboardClient from "./dashboard-client";
import { Navbar } from "../nav";
import { service_data } from "@/data/services/wraperdata.db";
import { form_data, message_sources_data } from '@/data/form_database/wraperdata.db';
import { assertAdminSaleRevenueOnly } from "../adminSaleAccess";
import { getAdminSaleScope } from "../saleScope.server";
import { filterCustomersForSale } from "@/utils/saleScope";

export default async function AdminPage() {
    await assertAdminSaleRevenueOnly();
    const { roles, currentUserId, isSaleOnly } = await getAdminSaleScope();

    const [rawData, service, sources, messageSources] = await Promise.all([
        customer_data(),
        service_data(),
        form_data(),
        message_sources_data(),
    ]);

    const data = isSaleOnly ? filterCustomersForSale(rawData, currentUserId) : rawData;

    return (
        <>
            <Navbar roles={roles} />
            <DashboardClient initialData={data} service={service} sources={sources} messageSources={messageSources} />
        </>
    );
}
