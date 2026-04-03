import Customer from '@/models/customer.model';

const CUSTOMER_CODE_TYPES = {
    NORMAL: 'NORMAL',
    TN: 'TN',
    /** Nhân viên gán/sửa mã (kể cả khách NULL hoặc sửa nhầm) — cho phép sửa */
    NORMAL_EDIT: 'NORMAL_EDIT',
};

const PAD_LEN = 5;
const BASE_NORMAL_NUMBER = 3900; // -> KH-03900
const BASE_TN_NUMBER = 1; // -> KH-TN00001

function pad5(n) {
    return String(n).padStart(PAD_LEN, '0');
}

export function parseCustomerCode(code) {
    if (typeof code !== 'string') return null;
    const trimmed = code.trim();
    if (!trimmed) return null;

    const normalMatch = /^KH-(\d+)$/.exec(trimmed);
    if (normalMatch) {
        const number = Number(normalMatch[1]);
        if (!Number.isFinite(number) || number < 0) return null;
        return {
            customerCodeType: CUSTOMER_CODE_TYPES.NORMAL,
            customerCodeNumber: number,
            canonicalCustomerCode: `KH-${pad5(number)}`,
        };
    }

    const tnMatch = /^KH-TN(\d+)$/.exec(trimmed);
    if (tnMatch) {
        const number = Number(tnMatch[1]);
        if (!Number.isFinite(number) || number < 0) return null;
        return {
            customerCodeType: CUSTOMER_CODE_TYPES.TN,
            customerCodeNumber: number,
            canonicalCustomerCode: `KH-TN${pad5(number)}`,
        };
    }

    return null;
}

export function isDuplicateKeyError(err) {
    if (!err) return false;
    return err?.code === 11000 || String(err?.name || '').toLowerCase().includes('mongoerror') && err?.code === 11000;
}

async function getMaxCustomerCodeNumberByType(customerCodeType) {
    // Dãy KH-xxxxx: cả NORMAL (tạo trực tiếp) và NORMAL_EDIT (nhân viên gán) dùng chung số tăng
    const typeFilter =
        customerCodeType === CUSTOMER_CODE_TYPES.NORMAL
            ? { $in: [CUSTOMER_CODE_TYPES.NORMAL, CUSTOMER_CODE_TYPES.NORMAL_EDIT] }
            : customerCodeType;

    const doc = await Customer.findOne({
        customerCodeType: typeFilter,
        customerCodeNumber: { $ne: null },
    })
        .sort({ customerCodeNumber: -1 })
        .select('customerCodeNumber')
        .lean();

    return doc?.customerCodeNumber ?? null;
}

export async function generateCustomerCodeByType(customerCodeType) {
    if (![CUSTOMER_CODE_TYPES.NORMAL, CUSTOMER_CODE_TYPES.TN].includes(customerCodeType)) {
        throw new Error(`Invalid customerCodeType: ${customerCodeType}`);
    }

    const maxNumber = await getMaxCustomerCodeNumberByType(customerCodeType);
    // Luôn theo rule: suggested = max + 1.
    // Nếu chưa có ai (max = null) thì coi như max = (start - 1).
    const startNumber = customerCodeType === CUSTOMER_CODE_TYPES.NORMAL ? BASE_NORMAL_NUMBER : BASE_TN_NUMBER;
    const nextNumber = (maxNumber == null ? startNumber - 1 : maxNumber) + 1;

    const canonicalCustomerCode =
        customerCodeType === CUSTOMER_CODE_TYPES.NORMAL
            ? `KH-${pad5(nextNumber)}`
            : `KH-TN${pad5(nextNumber)}`;

    return {
        customerCode: canonicalCustomerCode,
        customerCodeType,
        customerCodeNumber: nextNumber,
    };
}

export async function isCustomerCodeAvailable(customerCode, excludeCustomerId = null) {
    if (!customerCode || typeof customerCode !== 'string') return false;
    const query = { customerCode };
    if (excludeCustomerId) {
        query._id = { $ne: excludeCustomerId };
    }
    return !(await Customer.exists(query));
}

export function getNormalCodeType() {
    return CUSTOMER_CODE_TYPES.NORMAL;
}

