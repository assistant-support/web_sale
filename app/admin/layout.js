export const dynamic = 'force-dynamic';

import { cookies } from 'next/headers';
import Layout_Login from '@/app/(auth)/login';
import Nav from '@/components/(layout)/nav';
import '@/styles/all.css'
import '@/styles/font.css';
import air from '@/app/layout.module.css'

export const metadata = {
    title: "Chăm sóc",
    description: "Chăm sóc khách hàng"
};

export default async function RootLayout({ children }) {
    const cookieStore = await cookies();
    const token = cookieStore.get(process.env.token)?.value;
    const response = await fetch(`${process.env.URL}/api/check`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ source: 1 }),
        cache: 'no-store'
    });
    let data = null;
    const result = await response.json();
    if (result.status === 2) { data = result.data }
    if (!data.role.includes('Admin')) {
        return (
            <div className="flex_center" style={{ height: '100%', width: '100%' }}>
                <h4 style={{ fontStyle: 'italic' }}>Bạn không có quyền truy cập trang này</h4>
            </div>
        )
    }
    return (
        <>

            {data ?
                <div className={air.layout}>
                    <div className={air.nav}>
                        <Nav data={data} />
                    </div>
                    <div className={air.main}>
                        {children}
                    </div>
                </div> :
                <Layout_Login />}
        </>
    );
}