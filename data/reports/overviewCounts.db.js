import connectDB from '@/config/connectDB';
import Customer from '@/models/customer.model';
import Appointment from '@/models/appointment.model';
import Form from '@/models/formclient';
import { getMessageSources } from '@/data/form_database/handledata.db';
import {
    buildCustomerMongoFilter,
    buildAppointmentMongoFilter,
    hasActiveGlobalFilters,
} from '@/utils/overviewReportFilters';

export async function getOverviewCountsUnfiltered() {
    await connectDB();
    const [
        customersTotal,
        appointmentsTotal,
        customersWithAppointmentsTotal,
        customersWithOrdersTotal,
        oldCustomersTotal,
        arrivedCustomersAgg,
    ] = await Promise.all([
        Customer.countDocuments({}),
        Appointment.countDocuments({}),
        Customer.countDocuments({ 'pipelineStatus.5': 'scheduled_unconfirmed_4' }),
        Customer.countDocuments({ 'serviceDetails.0': { $exists: true } }),
        Customer.countDocuments({ customerType: 'old' }),
        Appointment.aggregate([
            { $match: { status: 'completed' } },
            { $group: { _id: '$customer' } },
            { $count: 'total' },
        ]),
    ]);
    const customersArrivedTotal = arrivedCustomersAgg?.[0]?.total ?? 0;
    return {
        customersTotal: customersTotal ?? 0,
        appointmentsTotal: appointmentsTotal ?? 0,
        customersWithAppointmentsTotal: customersWithAppointmentsTotal ?? 0,
        customersWithOrdersTotal: customersWithOrdersTotal ?? 0,
        oldCustomersTotal: oldCustomersTotal ?? 0,
        customersArrivedTotal,
    };
}

export async function getOverviewCountsFiltered(filters = {}) {
    await connectDB();
    const [forms, messageSources] = await Promise.all([
        Form.find({}).select('_id name').lean(),
        getMessageSources().catch(() => []),
    ]);
    const allSources = [...(forms || []), ...(messageSources || [])];
    const customerQuery = await buildCustomerMongoFilter(filters, allSources);

    const matchingCustomers = await Customer.find(customerQuery).select('_id pipelineStatus serviceDetails customerType').lean();
    const customerIds = matchingCustomers.map((c) => c._id);
    const appointmentQuery = buildAppointmentMongoFilter(filters, customerIds);

    const [
        appointmentsTotal,
        arrivedCustomersAgg,
    ] = await Promise.all([
        Appointment.countDocuments(appointmentQuery),
        Appointment.aggregate([
            { $match: { ...appointmentQuery, status: 'completed' } },
            { $group: { _id: '$customer' } },
            { $count: 'total' },
        ]),
    ]);

    const customersTotal = matchingCustomers.length;
    const customersWithOrdersTotal = matchingCustomers.filter(
        (c) => Array.isArray(c.serviceDetails) && c.serviceDetails.length > 0
    ).length;
    const oldCustomersTotal = matchingCustomers.filter(
        (c) => c.customerType === 'old' || (Array.isArray(c.serviceDetails) && c.serviceDetails.length > 0)
    ).length;

    const aptCustomerIds = customerIds.length
        ? await Appointment.distinct('customer', appointmentQuery)
        : [];
    const aptCustomerIdSet = new Set(aptCustomerIds.map(String));

    const customersWithAppointmentsTotal = matchingCustomers.filter((c) => {
        const pipeline = Array.isArray(c.pipelineStatus) ? c.pipelineStatus : [];
        const hasPipeline = pipeline.length > 5 && pipeline[5] === 'scheduled_unconfirmed_4';
        return hasPipeline || aptCustomerIdSet.has(String(c._id));
    }).length;

    const customersArrivedTotal = arrivedCustomersAgg?.[0]?.total ?? 0;

    return {
        customersTotal,
        appointmentsTotal: appointmentsTotal ?? 0,
        customersWithAppointmentsTotal,
        customersWithOrdersTotal,
        oldCustomersTotal,
        customersArrivedTotal,
    };
}

export async function getOverviewCounts(filters = {}) {
    if (!hasActiveGlobalFilters(filters)) {
        return getOverviewCountsUnfiltered();
    }
    return getOverviewCountsFiltered(filters);
}
