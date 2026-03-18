import "./globals.css";
import { Inter } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import SiteShell from "@/components/SiteShell";

const inter = Inter({ subsets: ["latin"], weight: ["400", "500", "600", "700", "800", "900"] });

export const metadata = {
  title: "OnlyTwins",
  description:
    "Done-for-you AI content subscription service. Subscribe, upload samples, and receive finished monthly content.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.className}>
      <body>
        <SiteShell>{children}</SiteShell>
        <Analytics />
      </body>
    </html>
  );
}
