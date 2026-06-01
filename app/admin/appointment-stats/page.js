import { appointment_data_all } from "@/data/appointment_db/wraperdata.db";
import DashboardClient from "./dashboard-client";
import { Navbar } from "../nav";
import { user_data } from "@/data/actions/get";
import { assertAdminSaleRevenueOnly } from "../adminSaleAccess";
import { getAdminSaleScope } from "../saleScope.server";
import { filterAppointmentsForSale, filterUsersForSale } from "@/utils/saleScope";

export default async function AdminPage() {
    await assertAdminSaleRevenueOnly();
    const { roles, currentUserId, isSaleOnly } = await getAdminSaleScope();

    const rawData = await appointment_data_all();
    const rawUsers = await user_data({});

    const data = isSaleOnly ? filterAppointmentsForSale(rawData, currentUserId) : rawData;
    const user = isSaleOnly ? filterUsersForSale(rawUsers, currentUserId) : rawUsers;

    return (
        <>
            <Navbar roles={roles} />
            <DashboardClient initialData={data} user={user} />
        </>
    );
}
