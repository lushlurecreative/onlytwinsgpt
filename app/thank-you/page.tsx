import Link from "next/link";
import BrandName from "@/app/components/BrandName";

export default function ThankYouPage() {
  return (
    <main style={{ padding: 48, maxWidth: 560, margin: "0 auto", textAlign: "center" }}>
      <h1 style={{ marginTop: 0, fontSize: 28 }}>Thank you for subscribing</h1>
      <p className="muted" style={{ marginBottom: 24 }}>
        Your payment was successful. Create your account or sign in to access your dashboard, upload
        samples, and manage your content.
      </p>
      <div style={{ display: "flex", flexDirection: "column", gap: 12, alignItems: "center" }}>
        <Link href="/login?redirectTo=/start" className="btn btn-primary" style={{ minWidth: 220 }}>
          Sign in or create account
        </Link>
        <Link href="/" className="btn btn-secondary" style={{ minWidth: 220 }}>
          Back to <BrandName />
        </Link>
      </div>
    </main>
  );
}
