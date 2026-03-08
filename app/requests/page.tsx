import RequestsClient from "@/app/requests/RequestsClient";
import { requireActiveSubscriber } from "@/lib/require-active-subscriber";
import PremiumCard from "@/components/PremiumCard";
import PremiumButton from "@/components/PremiumButton";

export const dynamic = "force-dynamic";

export default async function RequestsPage() {
  await requireActiveSubscriber("/requests");

  return (
    <main style={{ padding: 24, maxWidth: 900, margin: "0 auto" }}>
      <PremiumCard className="hero-refined">
        <h1 style={{ marginTop: 0, fontSize: 34, letterSpacing: "-0.02em" }}>View My Requests</h1>
        <p style={{ opacity: 0.85, maxWidth: 680 }}>
          Set your monthly output mix and track each stage from training prep to generation completion.
        </p>
      </PremiumCard>
      <div style={{ marginTop: 16 }}>
        <RequestsClient />
      </div>

      <div style={{ marginTop: 16 }}>
        <PremiumButton href="/onboarding/intake">Set Preferences</PremiumButton>
      </div>
    </main>
  );
}
