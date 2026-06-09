import { call_data } from "@/data/call/wraperdata.db";
import DashboardClient from "./dashboard-client";
import { Navbar } from "../nav";
import { assertAdminSaleRevenueOnly } from "../adminSaleAccess";
import { getAdminSaleScope } from "../saleScope.server";
import { filterCallsForSale } from "@/utils/saleScope";
import { user_data } from "@/data/actions/get";

export default async function AdminPage() {
    await assertAdminSaleRevenueOnly();
    const { roles, currentUserId, isSaleOnly } = await getAdminSaleScope();

    const [rawData, users] = await Promise.all([
        call_data(),
        user_data({}),
    ]);
    const data = isSaleOnly ? filterCallsForSale(rawData, currentUserId) : rawData;

    return (
        <>
            <Navbar roles={roles} />
            <DashboardClient initialData={data} user={Array.isArray(users) ? users : []} />
        </>
    );
}
