import "./globals.css";
import { Analytics } from "@vercel/analytics/next";
import SiteShell from "@/components/SiteShell";

export const metadata = {
  title: "OnlyTwins",
  description:
    "Done-for-you AI content subscription service. Subscribe, upload samples, and receive finished monthly content.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <SiteShell>{children}</SiteShell>
        <Analytics />
      </body>
    </html>
  );
}
