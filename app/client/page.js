import { Suspense } from 'react';
import { user_data, label_data, zalo_data } from "@/data/actions/get";
import { form_data } from '@/data/form_database/wraperdata.db'
import { getCombinedData } from "../actions/customer.actions";
import checkAuthToken from "@/utils/checktoken";
import CustomerView from './index';
import { variant_data } from '../actions/variant.actions';
import { getRunningSchedulesAction } from '../actions/schedule.actions';

function PageSkeleton() {
    return <div>Đang tải trang...</div>;
}

export default async function Page({ searchParams }) {
    let c = await searchParams
    const user = await checkAuthToken()
    if (!user) return null
    const [initialResult, userAuth, sources, label, zalo, users, variant, running] = await Promise.all([
        getCombinedData(c),
        user_data({ _id: user.id }),
        form_data(),
        label_data(),
        zalo_data(),
        user_data({}),
        variant_data(),
        getRunningSchedulesAction()
    ]);

    if (!userAuth[0].role.includes('Admin') && !userAuth[0].role.includes('Sale')) {
        return (
            <div className="flex_center" style={{ height: '100%', width: '100%' }}>
                <h4 style={{ fontStyle: 'italic' }}>Bạn không có quyền truy cập trang này</h4>
            </div>
        )
    }
    const reversedLabel = [...label].reverse();

    return (
        <Suspense fallback={<PageSkeleton />}>
            <CustomerView
                initialResult={initialResult}
                user={userAuth}
                sources={sources}
                labelData={reversedLabel}
                formData={sources}
                zaloData={zalo}
                users={users}
                variant={variant}
                running={running.data}
                c={c}
            />
        </Suspense>
    );
}