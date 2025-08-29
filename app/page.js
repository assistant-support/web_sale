import { user_data } from "@/data/actions/get";
import { CheckRole } from "@/function/server"
import AdminPage from "@/app/admin/page";
import TeacherPage from "@/app/(teacher)/index";

export default async function Home() {
  const user = await CheckRole();
  return (
    <>
      {user.role == 'Admin' ? <AdminPage /> : <TeacherPage data={await user_data({ _id: user.id })} />}
    </>
  )
}
