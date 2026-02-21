import "./globals.css";
import Link from "next/link";
import { MARKETING_MESSAGE_MAP } from "@/lib/marketing-message-map";
import BrandName from "@/app/components/BrandName";

export const metadata = {
  title: "OnlyTwins",
  description:
    "Done-for-you AI content subscription service. Subscribe, upload samples, and receive finished monthly content.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div className="site">
          <header className="header">
            <div className="header-inner">
              <Link href="/" className="brand" aria-label="OnlyTwins home">
                <BrandName />
              </Link>
              <nav className="nav" aria-label="Primary">
                <Link href="/how-it-works" className="nav-link">
                  How It Works
                </Link>
                <Link href="/results" className="nav-link">
                  Results
                </Link>
                <Link href="/pricing" className="nav-link">
                  Pricing
                </Link>
                <Link href="/about" className="nav-link">
                  About
                </Link>
                <Link href="/faq" className="nav-link">
                  FAQ
                </Link>
                <Link href="/contact" className="nav-link">
                  Contact
                </Link>
              </nav>
              <a href={MARKETING_MESSAGE_MAP.cta.primaryHref} className="btn btn-primary">
                {MARKETING_MESSAGE_MAP.cta.primaryLabel}
              </a>
            </div>
          </header>

          <main className="main">{children}</main>

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
                  <Link href="/contact">Contact</Link>
                </div>
              </div>
              <div>
                <h4>Legal</h4>
                <div className="footer-links">
                  <Link href="/legal">Terms</Link>
                  <Link href="/legal">Privacy</Link>
                </div>
              </div>
            </div>
            <p className="copyright">
              <BrandName /> © {new Date().getFullYear()}
            </p>
          </footer>
        </div>
      </body>
    </html>
  );
}
