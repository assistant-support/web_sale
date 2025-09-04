import { customer_data } from "@/data/customers/wraperdata.db";
import DashboardClient from "./dashboard-client";
import { Navbar } from "../nav";

export default async function AdminPage() {
    const data = await customer_data();
    return (
        <>
            <Navbar />
            <DashboardClient initialData={data} />
        </>
    );
}