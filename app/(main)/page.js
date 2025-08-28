// app/(main)/page.js

import { getZaloAccounts } from "@/app/actions/zaloAccountActions";
import { getCurrentUser } from "@/lib/session";
import ClientPage from "./client/index";
import { Data_Client, Data_Label, Data_Status } from "@/data/customer";

export default async function Page({ searchParams }) {
  const [userData, labelResponse, statusResponse, zaloAccountsResponse] =
    await Promise.all([
      getCurrentUser(),
      Data_Label(),
      Data_Status(),
      getZaloAccounts(),
    ]);

  // ** MODIFIED: Truyền thẳng searchParams, không truy cập trực tiếp
  // Tạo một bản sao để có thể thêm thuộc tính zaloActive
  const finalSearchParams = await { ...searchParams };

  if (userData?.zaloActive?._id) {
    finalSearchParams.zaloActive = userData.zaloActive._id.toString();
  }

  const clientResponse = await Data_Client(finalSearchParams);

  return (
    <ClientPage
      initialData={clientResponse.data}
      initialPagination={clientResponse.pagination}
      initialLabels={labelResponse.data}
      initialStatuses={statusResponse.data}
      user={userData}
      initialZaloAccounts={zaloAccountsResponse.data}
    />
  );
}
