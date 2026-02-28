import { customer_data } from "@/data/customers/wraperdata.db";
import DashboardClient from "./dashboard-client";
import { Navbar } from "../nav";
import { user_data } from "@/data/actions/get";
import { discount_data } from "@/app/actions/discount.actions";
import { service_data } from "@/data/services/wraperdata.db";
import { form_data, message_sources_data } from '@/data/form_database/wraperdata.db';

export default async function AdminPage() {
    const [data, users, discountPrograms, services, sources, messageSources] = await Promise.all([
        customer_data(),
        user_data({}),
        discount_data(),
        service_data(),
        form_data(),
        message_sources_data(),
    ]);
    
    return (
        <>
            <Navbar />
            <DashboardClient 
                initialData={data} 
                users={users} 
                discountPrograms={discountPrograms || []}
                services={services || []}
                sources={sources || []}
                messageSources={messageSources || []}
            />
        </>
    );
}