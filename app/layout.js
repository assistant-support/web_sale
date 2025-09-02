export const dynamic = 'force-dynamic';

import '@/styles/all.css'
import '@/styles/font.css';
import './globals.css'
import { ThemeProvider } from "@/components/theme-provider"

export const metadata = {
  title: "AI Robotic",
  description: "Khóa học công nghệ cho trẻ"
};

export default async function RootLayout({ children }) {

  return (
    <html lang="en"  suppressHydrationWarning>
      <body>
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}