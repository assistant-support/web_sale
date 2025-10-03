import checkAuthToken from "@/utils/checktoken"

export const dynamic = 'force-dynamic';
import Layout_Login from '@/app/(auth)/login';
import Nav from '@/components/(layout)/nav';
import '@/styles/all.css'
import '@/styles/font.css';
import air from '@/app/layout.module.css'
import { NotificationProvider } from '@/contexts/page_pancake';
import { Toaster } from '@/components/ui/sonner';
import { NotificationHandler } from '@/components/NotificationHandler';

export const metadata = {
    title: "CRM Sale",
    description: "Quản lý dịch vụ"
};

export default async function RootLayout({ children }) {
    let user = await checkAuthToken()
    if (!user) {
        return <Layout_Login />
    }
    return (
        <NotificationProvider>
            <div className={air.layout}>
                <div className={air.nav}>
                    <Nav data={user} />
                </div>
                <div className={air.main}>
                    {children}
                </div>
            </div>
        </NotificationProvider>
    );
}
