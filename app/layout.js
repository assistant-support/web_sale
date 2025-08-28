export const dynamic = 'force-dynamic';

import { cookies } from 'next/headers';
import Layout_Login from '@/app/(auth)/login';
import Nav from '@/components/(layout)/nav';
import '@/styles/all.css'
import '@/styles/font.css';
import air from './layout.module.css'

export const metadata = {
  title: "AI Robotic",
  description: "Khóa học công nghệ cho trẻ"
};

export default async function RootLayout({ children }) {

  return (
    <html lang="en">
      <body>
        {children}
      </body>
    </html>
  );
}