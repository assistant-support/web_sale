import { form_data } from "@/data/form_database/wraperdata.db";
import Client from "./ui/main";

export default async function FormPage({ searchParams }) {
    const { id } = await searchParams;
    const data = await form_data(id);

    return (
        <div style={{ background: '#ebffff', padding: '1rem' }}>
            <Client id={data} />
        </div>

    );
}   