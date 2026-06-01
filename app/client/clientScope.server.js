import 'server-only';

import checkAuthToken from '@/utils/checktoken';
import { user_data } from '@/data/actions/get';
import {
    mustScopeClientListToAssignees,
    normalizeRoles,
    normalizeUserId,
} from '@/utils/saleScope';

/** Phạm vi danh sách khách trên trang Chăm sóc theo user đăng nhập. */
export async function getClientPageScope() {
    const session = await checkAuthToken();
    if (!session?.id) {
        return { session: null, roles: [], userId: '', restrictToAssignee: false };
    }

    const userId = normalizeUserId(session.id);
    const users = await user_data({ _id: userId });
    const dbUser = users?.[0];
    const roles = normalizeRoles(dbUser?.role || session.role);
    const restrictToAssignee = mustScopeClientListToAssignees(roles);

    return {
        session,
        roles,
        userId: normalizeUserId(dbUser?._id || userId),
        restrictToAssignee,
    };
}
