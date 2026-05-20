import { redirect } from 'next/navigation';
import checkAuthToken from '@/utils/checktoken';

/** Admin Sale (không có Admin/Manager) chỉ được dùng mục Doanh thu trong CRM Dashboard */
export function isAdminSaleRestrictedRole(roles) {
    const r = Array.isArray(roles) ? roles : [];
    return r.includes('Admin Sale') && !r.includes('Admin') && !r.includes('Manager');
}

/** Gọi đầu các trang /admin không phải Doanh thu — chuyển Admin Sale về /admin/revenue */
export async function assertAdminSaleRevenueOnly() {
    const user = await checkAuthToken();
    if (!user?.role) return;
    if (isAdminSaleRestrictedRole(user.role)) {
        redirect('/admin/revenue');
    }
}
