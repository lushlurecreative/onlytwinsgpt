import Link from "next/link";
import RequestsClient from "@/app/requests/RequestsClient";
import { requireActiveSubscriber } from "@/lib/require-active-subscriber";

export const dynamic = "force-dynamic";

export default async function RequestsPage() {
  await requireActiveSubscriber("/requests");

  return (
    <main style={{ padding: 24, maxWidth: 900, margin: "0 auto" }}>
      <h1 style={{ marginTop: 0 }}>View My Requests</h1>
      <p style={{ opacity: 0.85 }}>Track your training and generation progress.</p>
      <RequestsClient />

      <div style={{ marginTop: 16 }}>
        <Link href="/training/photos" className="btn btn-primary">
          Start Creating My Twin
        </Link>
      </div>
    </main>
  );
}
