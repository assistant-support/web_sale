import Main from "./ui/main";
import { user_data } from "@/data/actions/get";

export default async function TeacherPage() {
    let data = await user_data({});
    return (
        <Main initialTeachers={data} />
    );
}