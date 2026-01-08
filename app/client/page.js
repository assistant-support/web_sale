import { Suspense } from 'react';
import { user_data, label_data, zalo_data } from "@/data/actions/get";
import { form_data, message_sources_data } from '@/data/form_database/wraperdata.db'
import { getCombinedData } from "../actions/customer.actions";
import checkAuthToken from "@/utils/checktoken";
import CustomerView from './index';
import { variant_data } from '../actions/variant.actions';
import { getRunningSchedulesAction } from '../actions/schedule.actions';
import { workflow_data } from '@/data/workflow/wraperdata.db';
import { service_data } from '@/data/services/wraperdata.db';
import { maskPhoneNumber } from '@/function';
import { customer_data } from '@/data/customers/wraperdata.db';
import { area_customer_data, filter_customer_data } from '@/data/actions/get';

function PageSkeleton() {
    return <div>Đang tải trang...</div>;
}

export default async function Page({ searchParams }) {
    let c = await searchParams
    const user = await checkAuthToken()
    if (!user) return null
    const [customer, initialResult, userAuth, sources, messageSources, label, zalo, users, variant, running, workflow, service, areaCustomers, filterCustomer] = await Promise.all([
        customer_data(),
        getCombinedData(c),
        user_data({ _id: user.id }),
        form_data(),
        message_sources_data(),
        label_data(),
        zalo_data(),
        user_data({}),
        variant_data(),
        getRunningSchedulesAction(),
        workflow_data(),
        service_data(),
        area_customer_data(),
        filter_customer_data()
    ]);
    const reversedLabel = [...label].reverse();
    if (userAuth && userAuth[0] && userAuth[0].role && userAuth[0].role.includes('Sale')) {
        const filteredData = initialResult.data.filter(item => {
            if (Array.isArray(item.assignees) && item.assignees.length > 0) {
                return item.assignees.some(
                    assignee => assignee.user && assignee.user._id === userAuth[0]._id
                );
            }
            return false;
        }).map(item => {
            return {
                ...item,
                phonex: maskPhoneNumber(item.phone) // tạo field mới phonex
            };
        });
        initialResult.data = filteredData;
        initialResult.total = filteredData.length;
    }
    // console.log(initialResult);
    // console.log('📊 [Page] filterCustomer data:', filterCustomer);
    // console.log('📊 [Page] Số lượng mỗi tháng:', {
    //     month1: filterCustomer?.month1?.length || 0,
    //     month2: filterCustomer?.month2?.length || 0,
    //     month3: filterCustomer?.month3?.length || 0,
    //     month4: filterCustomer?.month4?.length || 0,
    //     month5: filterCustomer?.month5?.length || 0,
    //     month6: filterCustomer?.month6?.length || 0,
    //     month7: filterCustomer?.month7?.length || 0,
    //     month8: filterCustomer?.month8?.length || 0,
    //     month9: filterCustomer?.month9?.length || 0,
    //     month10: filterCustomer?.month10?.length || 0,
    //     month11: filterCustomer?.month11?.length || 0,
    //     month12: filterCustomer?.month12?.length || 0,
    // });
    
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
                running={running.data}
                c={c}
                workflow={workflow}
                service={service}
                customer={customer}
                areaCustomers={areaCustomers || []}
                filterCustomer={filterCustomer || {}}
            />
        </Suspense>
    );
}