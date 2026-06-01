import { customer_data } from "@/data/customers/wraperdata.db";
import DashboardClient from "./dashboard-client";
import { Navbar } from "../nav";
import { user_data } from "@/data/actions/get";
import { assertAdminSaleRevenueOnly } from "../adminSaleAccess";
import { getAdminSaleScope } from "../saleScope.server";
import { filterCustomersForSale, filterUsersForSale } from "@/utils/saleScope";

export default async function AdminPage() {
    await assertAdminSaleRevenueOnly();
    const { roles, currentUserId, isSaleOnly } = await getAdminSaleScope();

    const rawData = await customer_data();
    const rawUsers = await user_data({});

    const data = isSaleOnly ? filterCustomersForSale(rawData, currentUserId) : rawData;
    const user = isSaleOnly ? filterUsersForSale(rawUsers, currentUserId) : rawUsers;

    return (
        <>
            <Navbar roles={roles} />
            <DashboardClient initialData={data} user={user} />
        </>
    );
}
