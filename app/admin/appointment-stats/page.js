import { appointment_data_all } from "@/data/appointment_db/wraperdata.db";
import DashboardClient from "./dashboard-client";
import { Navbar } from "../nav";

export default async function AdminPage() {
    const data = await appointment_data_all();
    console.log(data);
    
    return (
        <>
            <Navbar />
            <DashboardClient initialData={data} />
        </>
    );
}