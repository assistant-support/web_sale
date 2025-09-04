export const dynamic = 'force-dynamic';

import '@/styles/all.css'
import '@/styles/font.css';
import './globals.css'
import { Toaster } from "@/components/ui/sonner"

export const metadata = {
  title: "AI Robotic",
  description: "Khóa học công nghệ cho trẻ"
};

export default async function RootLayout({ children }) {
  return (
    <html lang="en" >
      <body>
        {children}
        <Toaster richColors position="top-right" />
      </body>
    </html>
  );
}