import { customer_data } from "@/data/customers/wraperdata.db";
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

    const rawData = await customer_data();
    const rawUsers = await user_data({});

    const data = isSaleOnly
        ? (Array.isArray(rawData) ? rawData.filter((c) =>
            Array.isArray(c?.assignees) &&
            c.assignees.some((a) => String(a?.user) === currentUserId)
        ) : [])
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