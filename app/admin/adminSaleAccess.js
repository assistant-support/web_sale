import { redirect } from 'next/navigation';
import checkAuthToken from '@/utils/checktoken';
import { isAdminSaleRestrictedRole } from '@/utils/saleScope';

export { isAdminSaleRestrictedRole };

/** Gọi đầu các trang /admin không phải Doanh thu — chuyển Admin Sale về /admin/revenue */
export async function assertAdminSaleRevenueOnly() {
    const user = await checkAuthToken();
    if (!user?.role) return;
    if (isAdminSaleRestrictedRole(user.role)) {
        redirect('/admin/revenue');
    }
}
