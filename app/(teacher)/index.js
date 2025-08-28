import { course_data } from '@/data/actions/get';
import TeacherDashboard from './main';

export default async function TeacherOverviewPage({ data }) {
    const courses = await course_data();
    return <TeacherDashboard currentUser={data} courses={courses} />;
}