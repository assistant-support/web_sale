/** Chuẩn hóa role từ JWT/DB (mảng, chuỗi đơn, hoặc thiếu). */
export function normalizeRoles(roles) {
    if (!roles) return [];
    if (Array.isArray(roles)) {
        return roles.map((r) => String(r).trim()).filter(Boolean);
    }
    const s = String(roles).trim();
    return s ? [s] : [];
}

/** Admin Sale (không Admin/Manager) — Thống kê chỉ Doanh thu, xem toàn bộ doanh thu. */
export function isAdminSaleRestrictedRole(roles) {
    const r = normalizeRoles(roles);
    return r.includes('Admin Sale') && !r.includes('Admin') && !r.includes('Manager');
}

/** Sale thuần — Thống kê đủ tab nhưng chỉ dữ liệu của chính sale đó. */
export function isSaleOnlyRole(roles) {
    const r = normalizeRoles(roles);
    return (
        r.includes('Sale') &&
        !r.includes('Admin') &&
        !r.includes('Manager') &&
        !r.includes('Admin Sale')
    );
}

export function normalizeUserId(value) {
    if (!value) return '';
    if (typeof value === 'object') {
        return String(value._id || value.id || value.$oid || '');
    }
    return String(value);
}

export function customerBelongsToSale(customer, saleUserId) {
    const uid = normalizeUserId(saleUserId);
    if (!uid || !customer) return false;
    if (!Array.isArray(customer.assignees) || customer.assignees.length === 0) {
        return false;
    }
    return customer.assignees.some((a) => normalizeUserId(a?.user) === uid);
}

export function filterCustomersForSale(customers, saleUserId) {
    if (!saleUserId) return customers;
    const list = Array.isArray(customers) ? customers : [];
    return list.filter((c) => customerBelongsToSale(c, saleUserId));
}

/** Giới hạn filter tháng sinh (mảng id) theo khách sale được phụ trách. */
export function scopeBirthMonthFilterForSale(filterCustomer, allowedCustomerIds) {
    const allowed = new Set(
        (Array.isArray(allowedCustomerIds) ? allowedCustomerIds : []).map((id) => String(id))
    );
    if (allowed.size === 0) {
        return {
            month1: [], month2: [], month3: [], month4: [],
            month5: [], month6: [], month7: [], month8: [],
            month9: [], month10: [], month11: [], month12: [],
        };
    }
    const src = filterCustomer && typeof filterCustomer === 'object' ? filterCustomer : {};
    const out = {};
    for (let i = 1; i <= 12; i++) {
        const key = `month${i}`;
        const ids = Array.isArray(src[key]) ? src[key] : [];
        out[key] = ids.filter((id) => allowed.has(String(id)));
    }
    return out;
}

export function filterUsersForSale(users, saleUserId) {
    const uid = normalizeUserId(saleUserId);
    if (!uid) return users;
    const list = Array.isArray(users) ? users : [];
    return list.filter((u) => normalizeUserId(u?._id) === uid);
}

export function filterAppointmentsForSale(appointments, saleUserId) {
    const uid = normalizeUserId(saleUserId);
    if (!uid) return appointments;
    const list = Array.isArray(appointments) ? appointments : [];
    return list.filter((a) => normalizeUserId(a?.createdBy) === uid);
}

export function filterCallsForSale(calls, saleUserId) {
    const uid = normalizeUserId(saleUserId);
    if (!uid) return calls;
    const list = Array.isArray(calls) ? calls : [];
    return list.filter((c) => normalizeUserId(c?.user) === uid);
}

export function filterHistoryLogsForSale(logs, saleUserId) {
    const uid = normalizeUserId(saleUserId);
    if (!uid) return logs;
    const list = Array.isArray(logs) ? logs : [];
    return list.filter((log) => normalizeUserId(log.createBy) === uid);
}

/** Đơn / snapshot serviceDetails do sale tạo hoặc chốt. */
export function serviceDetailBelongsToSale(detail, saleUserId) {
    const uid = normalizeUserId(saleUserId);
    if (!uid || !detail) return false;
    return (
        normalizeUserId(detail.createdBy) === uid ||
        normalizeUserId(detail.closedBy) === uid
    );
}

/** Doanh thu: chỉ khách có đơn do sale đó tạo/chốt; giữ lại đúng các đơn đó trong serviceDetails. */
export function filterCustomersForSaleRevenue(customers, saleUserId) {
    if (!saleUserId) return customers;
    const list = Array.isArray(customers) ? customers : [];
    const result = [];

    for (const c of list) {
        const details = Array.isArray(c.serviceDetails)
            ? c.serviceDetails
            : c.serviceDetails
                ? [c.serviceDetails]
                : [];
        const filteredDetails = details.filter((d) => serviceDetailBelongsToSale(d, saleUserId));
        if (filteredDetails.length === 0) continue;
        result.push({ ...c, serviceDetails: filteredDetails });
    }

    return result;
}
