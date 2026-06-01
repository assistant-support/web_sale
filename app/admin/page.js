import checkAuthToken from "@/utils/checktoken";
import { redirect } from "next/navigation";
import { isAdminSaleRestrictedRole } from "@/utils/saleScope";

export default async function TestPage() {
    const user = await checkAuthToken();
    const roles = user?.role || [];
    if (isAdminSaleRestrictedRole(roles)) {
        redirect('/admin/revenue');
    }
    if (roles.includes('Sale') && !roles.includes('Admin') && !roles.includes('Manager')) {
        redirect('/admin/data-reception');
    }
    redirect("/admin/data-reception");
}