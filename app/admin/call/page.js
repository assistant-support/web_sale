import { call_data } from "@/data/call/wraperdata.db";
import DashboardClient from "./dashboard-client";
import { Navbar } from "../nav";
import { assertAdminSaleRevenueOnly } from "../adminSaleAccess";
import { getAdminSaleScope } from "../saleScope.server";
import { filterCallsForSale } from "@/utils/saleScope";

export default async function AdminPage() {
    await assertAdminSaleRevenueOnly();
    const { roles, currentUserId, isSaleOnly } = await getAdminSaleScope();

    const rawData = await call_data();
    const data = isSaleOnly ? filterCallsForSale(rawData, currentUserId) : rawData;

    return (
        <>
            <Navbar roles={roles} />
            <DashboardClient initialData={data} />
        </>
    );
}
