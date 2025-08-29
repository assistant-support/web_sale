import Report from "../ui/report";
import { user_data } from "@/data/actions/get";

export default async function TeacherPage() {
    let data = await user_data({ type: 'report' });
    return (
        <Report initialReports={data} />
    );
}