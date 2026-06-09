import mongoose from 'mongoose';
import { customerMatchesSourceFilter, DIRECT_SOURCE_FORM_ID } from '@/utils/customerSourceConstants';

export function dedupeById(list) {
    const seen = new Set();
    return (list || []).filter((item) => {
        const id = String(item?._id ?? '');
        if (!id) return true;
        if (seen.has(id)) return false;
        seen.add(id);
        return true;
    });
}

function inDateRange(value, startDate, endDate) {
    if (!value) return !startDate && !endDate;
    const dt = new Date(value);
    if (Number.isNaN(dt.getTime())) return false;
    if (startDate) {
        const start = new Date(startDate + 'T00:00:00');
        if (dt < start) return false;
    }
    if (endDate) {
        const end = new Date(endDate + 'T23:59:59.999');
        if (dt > end) return false;
    }
    return true;
}

export function customerHasOrders(customer) {
    return Array.isArray(customer?.serviceDetails) && customer.serviceDetails.length > 0;
}

export function customerIsOld(customer) {
    if (customer?.customerType === 'old') return true;
    return customerHasOrders(customer);
}

export function matchesCustomerTypeFilter(customer, customerTypeFilter = 'all') {
    if (customerTypeFilter === 'all') return true;
    if (customerTypeFilter === 'old') return customerIsOld(customer);
    if (customerTypeFilter === 'new') return !customerIsOld(customer);
    return true;
}

/** Bộ lọc toàn cục cho khách hàng: ngày, nguồn, dịch vụ, loại khách hàng */
export function applyGlobalCustomerFilters(customers, filters, sources = []) {
    const {
        startDate = '',
        endDate = '',
        sourceFilter = 'all',
        serviceFilter = 'all',
        customerTypeFilter = 'all',
    } = filters || {};

    return dedupeById(customers).filter((c) => {
        if (!inDateRange(c?.createAt, startDate, endDate)) return false;
        if (sourceFilter !== 'all' && !customerMatchesSourceFilter(c, sourceFilter, sources)) return false;
        if (serviceFilter !== 'all') {
            const details = Array.isArray(c?.serviceDetails) ? c.serviceDetails : [];
            const hasService = details.some(
                (sd) => String(sd?.selectedService?._id || sd?.selectedService) === String(serviceFilter)
            );
            if (!hasService) return false;
        }
        if (!matchesCustomerTypeFilter(c, customerTypeFilter)) return false;
        return true;
    });
}

export function matchesGlobalCustomerFilter(customer, filters, sources = []) {
    if (!customer) return false;
    return applyGlobalCustomerFilters([customer], filters, sources).length > 0;
}

/** Khách đã lưu mốc FU cụ thể (FU1 / FU2 / FU3) trong mảng FU */
export function customerHasFuKey(customer, fuKey) {
    const key = String(fuKey || '').trim();
    if (!key) return false;
    const list = Array.isArray(customer?.FU) ? customer.FU : [];
    return list.some(
        (item) => item && typeof item === 'object' && Object.prototype.hasOwnProperty.call(item, key)
    );
}

/** Chỉ giữ khách có ít nhất một lịch hẹn trong danh sách đã lọc */
export function filterCustomersWithAppointments(customers, filteredAppointments) {
    const ids = new Set();
    (filteredAppointments || []).forEach((a) => {
        const cid = String(a?.customer?._id || a?.customer || '');
        if (cid) ids.add(cid);
    });
    return (customers || []).filter((c) => ids.has(String(c?._id || '')));
}

/** Bộ lọc toàn cục cho lịch hẹn: ngày, loại lịch hẹn */
export function applyGlobalAppointmentFilters(appointments, filters) {
    const {
        startDate = '',
        endDate = '',
        appointmentTypeFilter = 'all',
    } = filters || {};

    return dedupeById(appointments).filter((a) => {
        if (!inDateRange(a?.appointmentDate, startDate, endDate)) return false;
        if (appointmentTypeFilter !== 'all' && a?.status !== appointmentTypeFilter) return false;
        return true;
    });
}

/** Bộ lọc toàn cục cho hội thoại: ngày, nguồn — loại hội thoại xử lý riêng ở bảng */
export function applyGlobalConversationFilters(conversations, filters, sources = [], messageSources = []) {
    const { startDate = '', endDate = '', sourceFilter = 'all' } = filters || {};
    let list = (conversations || []).filter((conv) => {
        if (!conv?.createdAt) return !startDate && !endDate;
        return inDateRange(conv.createdAt, startDate, endDate);
    });

    if (sourceFilter !== 'all') {
        const meta = [...(sources || []), ...(messageSources || [])].find(
            (s) => String(s._id) === String(sourceFilter)
        );
        const label = meta?.name ? String(meta.name).trim().toLowerCase() : String(sourceFilter).trim().toLowerCase();
        list = list.filter((conv) => {
            const page = String(conv.pageDisplayName || conv.name || '').toLowerCase();
            if (label.includes('tin nhắn')) {
                return page.includes('tin nhắn') || page.includes('message');
            }
            return page.includes(label) || label.includes(page);
        });
    }

    return list;
}

export function applyConversationTypeFilter(conversations, conversationTypeFilter = 'all') {
    if (conversationTypeFilter === 'lead') {
        return conversations.filter((conv) => conv?.status === 'LEAD');
    }
    if (conversationTypeFilter === 'not_lead') {
        return conversations.filter((conv) => conv?.status === 'NOT_LEAD');
    }
    return conversations;
}

/** Lịch hẹn của khách thỏa bộ lọc toàn cục (dùng customer populate trên appointment) */
export function appointmentsForGlobalCustomers(appointments, filters, sources = []) {
    return (appointments || []).filter((a) => matchesGlobalCustomerFilter(a?.customer, filters, sources));
}

/** Gom dữ liệu toàn cục; khi chọn loại LH → chỉ khách có lịch hẹn khớp loại đó */
export function buildGlobalFilteredOverviewData(customers, appointments, conversations, filters, sources, messageSources) {
    let filteredCustomers = applyGlobalCustomerFilters(customers, filters, sources);
    const filteredAppointments = appointmentsForGlobalCustomers(
        applyGlobalAppointmentFilters(appointments, filters),
        filters,
        sources
    );

    if (filters?.appointmentTypeFilter && filters.appointmentTypeFilter !== 'all') {
        filteredCustomers = filterCustomersWithAppointments(filteredCustomers, filteredAppointments);
    }

    const filteredConversations = applyGlobalConversationFilters(
        conversations,
        filters,
        sources,
        messageSources
    );

    return { filteredCustomers, filteredAppointments, filteredConversations };
}

export function customerHasScheduledAppointment(customer) {
    const pipeline = Array.isArray(customer?.pipelineStatus) ? customer.pipelineStatus : [];
    return pipeline.length > 5 && pipeline[5] === 'scheduled_unconfirmed_4';
}

/**
 * Tính thẻ từ đúng nguồn bảng đang hiển thị:
 * - Tổng KH: bảng tiếp nhận
 * - Hoàn thành đơn / khách cũ: bảng khách hàng (mẫu số = tổng bảng KH)
 * - Tỷ lệ hẹn / tổng LH / rớt: bảng lịch hẹn (mẫu số tỷ lệ = tổng bảng KH)
 */
export function computeCardStatsFromTables(receptionCustomers, customerTableCustomers, appointmentTableAppointments) {
    const receptionCustomersTotal = (receptionCustomers || []).length;
    const customerTableTotal = (customerTableCustomers || []).length;
    const appointmentsTotal = (appointmentTableAppointments || []).length;

    const customersWithOrdersTotal = (customerTableCustomers || []).filter(customerHasOrders).length;
    const oldCustomersTotal = (customerTableCustomers || []).filter(customerIsOld).length;

    const aptCustomerIds = new Set();
    (appointmentTableAppointments || []).forEach((a) => {
        const cid = String(a?.customer?._id || a?.customer || '');
        if (cid) aptCustomerIds.add(cid);
    });
    const customersWithAppointmentsTotal = aptCustomerIds.size;

    const arrivedIds = new Set();
    (appointmentTableAppointments || []).filter((a) => a?.status === 'completed').forEach((a) => {
        const cid = String(a?.customer?._id || a?.customer || '');
        if (cid) arrivedIds.add(cid);
    });

    return {
        receptionCustomersTotal,
        customerTableTotal,
        appointmentsTotal,
        customersWithOrdersTotal,
        oldCustomersTotal,
        customersWithAppointmentsTotal,
        customersArrivedTotal: arrivedIds.size,
    };
}

export function hasActiveGlobalFilters(filters) {
    const {
        startDate = '',
        endDate = '',
        sourceFilter = 'all',
        serviceFilter = 'all',
        appointmentTypeFilter = 'all',
        customerTypeFilter = 'all',
    } = filters || {};
    return Boolean(
        startDate
        || endDate
        || sourceFilter !== 'all'
        || serviceFilter !== 'all'
        || appointmentTypeFilter !== 'all'
        || customerTypeFilter !== 'all'
    );
}

function mergeCustomerTypeMongo(baseQ, customerTypeFilter = 'all') {
    if (customerTypeFilter === 'all') return baseQ;
    const typeQ = customerTypeFilter === 'old'
        ? { $or: [{ customerType: 'old' }, { 'serviceDetails.0': { $exists: true } }] }
        : {
            $and: [
                { $or: [{ customerType: { $exists: false } }, { customerType: { $ne: 'old' } }] },
                { $or: [{ serviceDetails: { $exists: false } }, { serviceDetails: { $size: 0 } }] },
            ],
        };
    if (!Object.keys(baseQ).length) return typeQ;
    return { $and: [baseQ, typeQ] };
}

/** MongoDB filter — dùng cho API counts */
export async function buildCustomerMongoFilter(filters, forms = []) {
    const {
        startDate = '',
        endDate = '',
        sourceFilter = 'all',
        serviceFilter = 'all',
        appointmentTypeFilter = 'all',
        customerTypeFilter = 'all',
    } = filters || {};

    const q = {};
    if (startDate) {
        q.createAt = { ...(q.createAt || {}), $gte: new Date(startDate + 'T00:00:00') };
    }
    if (endDate) {
        q.createAt = { ...(q.createAt || {}), $lte: new Date(endDate + 'T23:59:59.999') };
    }
    if (serviceFilter !== 'all' && mongoose.isValidObjectId(serviceFilter)) {
        q['serviceDetails.selectedService'] = new mongoose.Types.ObjectId(serviceFilter);
    }
    if (sourceFilter !== 'all') {
        if (!mongoose.isValidObjectId(sourceFilter)) {
            if (String(sourceFilter).trim() === 'Tin nhắn') {
                q.sourceDetails = { $regex: /^tin nhắn/i };
            } else {
                q.sourceDetails = String(sourceFilter).trim();
            }
        } else if (sourceFilter === DIRECT_SOURCE_FORM_ID) {
            q.source = new mongoose.Types.ObjectId(DIRECT_SOURCE_FORM_ID);
        } else {
            const form = forms.find((f) => String(f._id) === String(sourceFilter));
            const or = [{ source: new mongoose.Types.ObjectId(sourceFilter) }];
            if (form?.name) {
                const escaped = String(form.name).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                or.push({ sourceDetails: new RegExp(`^${escaped}$`, 'i') });
                if (/tin nhắn/i.test(form.name)) {
                    or.push({ sourceDetails: { $regex: /^tin nhắn/i } });
                }
            }
            q.$or = or;
        }
    }

    if (appointmentTypeFilter !== 'all') {
        const Appointment = (await import('@/models/appointment.model')).default;
        const aptQ = { status: appointmentTypeFilter };
        if (startDate) {
            aptQ.appointmentDate = { ...(aptQ.appointmentDate || {}), $gte: new Date(startDate + 'T00:00:00') };
        }
        if (endDate) {
            aptQ.appointmentDate = { ...(aptQ.appointmentDate || {}), $lte: new Date(endDate + 'T23:59:59.999') };
        }
        const customerIds = await Appointment.distinct('customer', aptQ);
        if (!customerIds.length) {
            q._id = { $in: [] };
        } else {
            q._id = { $in: customerIds };
        }
    }

    return mergeCustomerTypeMongo(q, customerTypeFilter);
}

export function buildAppointmentMongoFilter(filters, customerIds = null) {
    const {
        startDate = '',
        endDate = '',
        appointmentTypeFilter = 'all',
    } = filters || {};

    const q = {};
    if (startDate) {
        q.appointmentDate = { ...(q.appointmentDate || {}), $gte: new Date(startDate + 'T00:00:00') };
    }
    if (endDate) {
        q.appointmentDate = { ...(q.appointmentDate || {}), $lte: new Date(endDate + 'T23:59:59.999') };
    }
    if (appointmentTypeFilter !== 'all') {
        q.status = appointmentTypeFilter;
    }
    if (customerIds && customerIds.length >= 0) {
        q.customer = { $in: customerIds };
    }
    return q;
}
