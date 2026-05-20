import { appointment_data_all } from "@/data/appointment_db/wraperdata.db";
import DashboardClient from "./dashboard-client";
import { Navbar } from "../nav";
import { user_data } from "@/data/actions/get";
import checkAuthToken from "@/utils/checktoken";
import { assertAdminSaleRevenueOnly } from "../adminSaleAccess";

export default async function AdminPage() {
    await assertAdminSaleRevenueOnly();
    const session = await checkAuthToken();
    const roles = session?.role || [];
    const currentUserId = session?.id ? String(session.id) : '';
    const isSaleOnly = roles.includes('Sale') && !roles.includes('Admin') && !roles.includes('Manager');

    const rawData = await appointment_data_all();
    const rawUsers = await user_data({});
    const data = isSaleOnly
        ? (Array.isArray(rawData) ? rawData.filter((a) => {
            const createdById = typeof a?.createdBy === 'object'
                ? String(a.createdBy?._id || a.createdBy?.id || '')
                : String(a?.createdBy || '');
            return createdById === currentUserId;
        }) : [])
        : rawData;
    const user = isSaleOnly
        ? (Array.isArray(rawUsers) ? rawUsers.filter((u) => String(u?._id) === currentUserId) : [])
        : rawUsers;

    return (
        <>
            <Navbar roles={roles} />
            <DashboardClient initialData={data} user={user} />
        </>
    );
}