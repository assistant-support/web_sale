import { course_data, student_data, user_data } from "@/data/actions/get";
import StudentDB from "./ui/student";
import TeacherPage from "./ui/teacher";


export default async function AdminPage() {
    const studentData = await student_data();
    const teacherData = await user_data({});
    const courseData = await course_data();

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <StudentDB data={studentData} />
            <TeacherPage teachers={teacherData} courses={courseData} />
        </div>
    );
}