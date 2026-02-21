import Link from "next/link";
import { createClient } from "@/lib/supabase-server";
import BrandName from "@/app/components/BrandName";

export default async function ThankYouPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  return (
    <main style={{ padding: 48, maxWidth: 560, margin: "0 auto", textAlign: "center" }}>
      <h1 style={{ marginTop: 0, fontSize: 28 }}>Thank you for subscribing</h1>
      <p className="muted" style={{ marginBottom: 24 }}>
        Your payment was successful. Your account is already set up and linked to this subscription.
      </p>
      <div style={{ display: "flex", flexDirection: "column", gap: 12, alignItems: "center" }}>
        {user ? (
          <Link href="/start" className="btn btn-primary" style={{ minWidth: 220 }}>
            Continue to your dashboard
          </Link>
        ) : (
          <Link href="/login?redirectTo=/start" className="btn btn-primary" style={{ minWidth: 220 }}>
            Sign in to access your dashboard
          </Link>
        )}
        <Link href="/" className="btn btn-secondary" style={{ minWidth: 220 }}>
          Back to <BrandName />
        </Link>
      </div>
    </main>
  );
}
