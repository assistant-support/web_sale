// app/layout.js
import "@/styles/all.css";
import { PanelProvider } from "@/contexts/PanelContext";
import { CampaignProvider } from "@/contexts/CampaignContext";

export const metadata = {
  title: "iTrail",
  description: "Chăm sóc tuyển sinh tự động",
};

export default function RootLayout({ children }) {
  return (
    <html lang="vi">
      <body>
        <CampaignProvider>
          <PanelProvider>{children}</PanelProvider>
        </CampaignProvider>
      </body>
    </html>
  );
}
