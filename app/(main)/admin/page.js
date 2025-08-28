// ** MODIFIED: Loại bỏ toàn bộ việc lấy dữ liệu ban đầu
import { form_data } from "@/data/form_database/wraperdata.db";
import AdminPageClient from "./AdminPageClient";

export default async function AdminPage() {
  const dataForm = await form_data()
  return <AdminPageClient data={dataForm} />;
}
