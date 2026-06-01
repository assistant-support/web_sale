/** ID form nguồn cha "Trực tiếp" */
export const DIRECT_SOURCE_FORM_ID = '68b5ebb3658a1123798c0ce4';

/** Nguồn chi tiết mặc định khi thêm khách lẻ (gắn với form Trực tiếp) */
export const DEFAULT_MANUAL_SOURCE_DETAIL = 'nhập trực tiếp tại quầy';

export function getCustomerSourceId(customer) {
    const src = customer?.source;
    if (!src) return '';
    if (typeof src === 'object' && src !== null) {
        return String(src._id || src.$oid || '');
    }
    return String(src);
}

/** Giá trị ban đầu cho dropdown nguồn chi tiết (form _id). */
export function getInitialSourceFormId(customer, forms = []) {
    const sid = getCustomerSourceId(customer);
    if (sid && sid !== DIRECT_SOURCE_FORM_ID && forms.some((f) => String(f._id) === sid)) {
        return sid;
    }
    const detail = customer?.sourceDetails ? String(customer.sourceDetails).trim() : '';
    if (detail) {
        const byName = forms.find(
            (f) => String(f.name || '').trim().toLowerCase() === detail.toLowerCase()
        );
        if (byName) return String(byName._id);
    }
    return DIRECT_SOURCE_FORM_ID;
}

/** Khách lẻ / chỉnh nguồn chi tiết thủ công (NORMAL, NORMAL_EDIT hoặc nguồn trong danh sách form chi tiết). */
export function isManualSourceCustomer(customer, forms = []) {
    const codeType = customer?.customerCodeType;
    if (codeType === 'TN') return false;

    const sid = getCustomerSourceId(customer);
    if (sid === DIRECT_SOURCE_FORM_ID) return true;
    if (forms.some((f) => String(f._id) === sid && String(f._id) !== DIRECT_SOURCE_FORM_ID)) {
        return true;
    }
    return codeType === 'NORMAL' || codeType === 'NORMAL_EDIT' || !codeType;
}

function isObjectId(str) {
    return /^[a-f\d]{24}$/i.test(String(str));
}

/** Lọc nguồn phía client (không import mongoose / models). */
export function customerMatchesSourceFilter(customer, sourceFilter, forms = []) {
    if (!sourceFilter || sourceFilter === 'all') return true;

    const filterStr = String(sourceFilter).trim();
    if (!filterStr) return true;

    const customerSourceId = getCustomerSourceId(customer);
    const customerSourceDetails = customer?.sourceDetails
        ? String(customer.sourceDetails).trim()
        : '';

    if (!isObjectId(filterStr)) {
        if (filterStr === 'Tin nhắn') {
            return customerSourceDetails.toLowerCase().startsWith('tin nhắn');
        }
        return customerSourceDetails === filterStr;
    }

    if (filterStr === DIRECT_SOURCE_FORM_ID) {
        return customerSourceId === DIRECT_SOURCE_FORM_ID;
    }

    if (customerSourceId === filterStr) return true;

    const formMeta = forms.find((f) => String(f._id) === filterStr);
    if (formMeta?.name && customerSourceDetails) {
        return customerSourceDetails.toLowerCase() === String(formMeta.name).toLowerCase();
    }

    return false;
}

export function buildManualSourceFormOptions(forms = [], selectedFormId) {
    const map = new Map();
    map.set(DIRECT_SOURCE_FORM_ID, {
        value: DIRECT_SOURCE_FORM_ID,
        label: DEFAULT_MANUAL_SOURCE_DETAIL,
    });

    for (const f of forms) {
        const id = String(f._id);
        if (id === DIRECT_SOURCE_FORM_ID) continue;
        const name = String(f.name || '').trim();
        if (!name) continue;
        map.set(id, { value: id, label: name });
    }

    if (selectedFormId && !map.has(String(selectedFormId))) {
        const found = forms.find((f) => String(f._id) === String(selectedFormId));
        if (found?.name) {
            map.set(String(selectedFormId), {
                value: String(selectedFormId),
                label: String(found.name).trim(),
            });
        }
    }

    return Array.from(map.values()).sort((a, b) => {
        if (a.value === DIRECT_SOURCE_FORM_ID) return -1;
        if (b.value === DIRECT_SOURCE_FORM_ID) return 1;
        return a.label.localeCompare(b.label, 'vi');
    });
}
