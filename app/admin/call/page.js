import { call_data } from "@/data/call/wraperdata.db";
import DashboardClient from "./dashboard-client";
import { Navbar } from "../nav";
import checkAuthToken from "@/utils/checktoken";
import { assertAdminSaleRevenueOnly } from "../adminSaleAccess";

export default async function AdminPage() {
    await assertAdminSaleRevenueOnly();
    const session = await checkAuthToken();
    const roles = session?.role || [];
    const currentUserId = session?.id ? String(session.id) : '';
    const isSaleOnly = roles.includes('Sale') && !roles.includes('Admin') && !roles.includes('Manager');

    const rawData = await call_data();
    const data = isSaleOnly
        ? (Array.isArray(rawData) ? rawData.filter((c) => {
            const ownerId = typeof c?.user === 'object'
                ? String(c.user?._id || c.user?.id || '')
                : String(c?.user || '');
            return ownerId === currentUserId;
        }) : [])
        : rawData;
    
    return (
        <>
            <Navbar roles={roles} />
            <DashboardClient initialData={data} />
        </>
    );
}