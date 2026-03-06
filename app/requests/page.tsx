import RequestsClient from "@/app/requests/RequestsClient";
import { requireActiveSubscriber } from "@/lib/require-active-subscriber";
import PremiumCard from "@/components/PremiumCard";
import PremiumButton from "@/components/PremiumButton";

export const dynamic = "force-dynamic";

export default async function RequestsPage() {
  await requireActiveSubscriber("/requests");

  return (
    <main style={{ padding: 24, maxWidth: 900, margin: "0 auto" }}>
      <PremiumCard>
        <h1 style={{ marginTop: 0 }}>View My Requests</h1>
        <p style={{ opacity: 0.85 }}>Track your training and generation progress.</p>
      </PremiumCard>
      <div style={{ marginTop: 16 }}>
        <RequestsClient />
      </div>

      <div style={{ marginTop: 16 }}>
        <PremiumButton href="/training/photos">Start Creating My Twin</PremiumButton>
      </div>
    </main>
  );
}
