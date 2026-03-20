"use client";

import { Suspense } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import BrandName from "@/app/components/BrandName";
import AuthNav from "@/components/AuthNav";
import PrimaryNav from "@/components/PrimaryNav";
import AnimatedBackground from "@/components/AnimatedBackground";
import PageTransition from "@/components/PageTransition";
import OnlyTwinsAssistant from "@/components/OnlyTwinsAssistant";
import ReferralCapture from "@/components/ReferralCapture";
import { WHATSAPP_LINK, WHATSAPP_NUMBER_DISPLAY } from "@/lib/support";

export default function SiteShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isAdmin = pathname?.startsWith("/admin") ?? false;

  if (isAdmin) {
    return (
      <div className="site site-shell">
        <AnimatedBackground />
        <PageTransition>{children}</PageTransition>
      </div>
    );
  }

  return (
    <div className="site site-shell">
      <Suspense>
        <ReferralCapture />
      </Suspense>
      <AnimatedBackground />
      <header className="header">
        <div className="header-inner">
          <Link href="/" className="brand" aria-label="OnlyTwins home">
            <BrandName />
          </Link>
          <nav className="nav" aria-label="Primary">
            <PrimaryNav />
            <AuthNav />
          </nav>
        </div>
      </header>
      <main className="main">
        <PageTransition>{children}</PageTransition>
      </main>
      <OnlyTwinsAssistant />
      <footer className="footer">
        <div className="footer-grid">
          <div>
            <div className="brand">
              <BrandName />
            </div>
            <p className="muted">
              Done-for-you AI content service for creators and agencies.
            </p>
          </div>
          <div>
            <h4>Company</h4>
            <div className="footer-links">
              <Link href="/about">About</Link>
              <Link href="/how-it-works">How It Works</Link>
              <Link href="/results">Results</Link>
            </div>
          </div>
          <div>
            <h4>Support</h4>
            <div className="footer-links">
              <Link href="/faq">FAQ</Link>
              <a href={WHATSAPP_LINK} target="_blank" rel="noopener noreferrer">
                WhatsApp: {WHATSAPP_NUMBER_DISPLAY}
              </a>
            </div>
          </div>
          <div>
            <h4>Legal</h4>
            <div className="footer-links">
              <Link href="/terms">Terms of Service</Link>
              <Link href="/privacy">Privacy Policy</Link>
            </div>
          </div>
        </div>
        <p className="copyright">
          <BrandName /> © 2023
        </p>
      </footer>
    </div>
  );
}
