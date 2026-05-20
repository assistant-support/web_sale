import checkAuthToken from "@/utils/checktoken";
import { redirect } from "next/navigation";

export default async function TestPage() {
    const user = await checkAuthToken();
    const roles = user?.role || [];
    const adminSaleRestricted =
        roles.includes('Admin Sale') && !roles.includes('Admin') && !roles.includes('Manager');
    if (adminSaleRestricted) {
        redirect('/admin/revenue');
    }
    if (roles.includes('Sale') && !roles.includes('Admin') && !roles.includes('Manager')) {
        redirect("/admin/allocation");
    }
    redirect("/admin/data-reception");
}