// app/(auth)/login/page.js
import Layout_Login from "@/components/(layout)/login";

export const metadata = {
  title: "Đăng nhập",
  description: "Trang đăng nhập hệ thống iTrail",
};

const Page = () => {
  return <Layout_Login />;
};

export default Page;
