import { Suspense } from 'react';
import { user_data, label_data, zalo_data } from "@/data/actions/get";
import { form_data, message_sources_data } from '@/data/form_database/wraperdata.db'
import { getCombinedData } from "../actions/customer.actions";
import checkAuthToken from "@/utils/checktoken";
import CustomerView from './index';
import { variant_data } from '../actions/variant.actions';
import { discount_data } from '../actions/discount.actions';
import { getRunningSchedulesAction } from '../actions/schedule.actions';
import { workflow_data } from '@/data/workflow/wraperdata.db';
import { service_data } from '@/data/services/wraperdata.db';
import { unitMedicine_data, treatmentDoctor_data } from '../actions/treatment.actions';
import { maskPhoneNumber } from '@/function';
import { customer_data } from '@/data/customers/wraperdata.db';
import { area_customer_data, filter_customer_data } from '@/data/actions/get';
import {
    filterCustomersForSale,
    scopeBirthMonthFilterForSale,
} from '@/utils/saleScope';
import { getClientPageScope } from './clientScope.server';

function PageSkeleton() {
    return <div>Đang tải trang...</div>;
}

export default async function Page({ searchParams }) {
    const c = await searchParams;
    const user = await checkAuthToken();
    if (!user) return null;

    const { userId, restrictToAssignee } = await getClientPageScope();
    const listParams = { ...c };
    if (restrictToAssignee && userId) {
        listParams.assignee = userId;
    }

    const [customer, initialResultRaw, userAuth, sources, messageSources, label, zalo, users, variant, discount, running, workflow, service, areaCustomers, filterCustomer, unitMedicines, treatmentDoctors] = await Promise.all([
        customer_data(),
        getCombinedData(listParams),
        user_data({ _id: user.id }),
        form_data(),
        message_sources_data(),
        label_data(),
        zalo_data(),
        user_data({}),
        variant_data(),
        discount_data(),
        getRunningSchedulesAction(),
        workflow_data(),
        service_data(),
        area_customer_data(),
        filter_customer_data(),
        unitMedicine_data(),
        treatmentDoctor_data()
    ]);
    const reversedLabel = [...label].reverse();

    let initialResult = initialResultRaw;
    if (restrictToAssignee && userId) {
        const scopedData = filterCustomersForSale(initialResult?.data || [], userId);
        initialResult = {
            ...initialResult,
            data: scopedData.map((item) => ({
                ...item,
                phonex: maskPhoneNumber(item.phone),
            })),
        };
    }

    const customerForSettings = restrictToAssignee && userId
        ? filterCustomersForSale(customer, userId)
        : customer;
    const filterCustomerScoped = restrictToAssignee && userId
        ? scopeBirthMonthFilterForSale(
            filterCustomer,
            customerForSettings.map((c) => c._id)
        )
        : filterCustomer || {};

    return (
        <Suspense fallback={<PageSkeleton />}>
            <CustomerView
                initialResult={initialResult}
                user={userAuth}
                sources={sources}
                messageSources={messageSources}
                labelData={reversedLabel}
                formData={sources}
                zaloData={zalo}
                users={users}
                variant={variant}
                discount={discount || []}
                running={running.data}
                c={c}
                workflow={workflow}
                service={service}
                customer={customerForSettings}
                areaCustomers={areaCustomers || []}
                filterCustomer={filterCustomerScoped}
                unitMedicines={unitMedicines || []}
                treatmentDoctors={treatmentDoctors || []}
            />
        </Suspense>
    );
}
