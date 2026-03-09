import RequestsClient from "@/app/requests/RequestsClient";
import { requireActiveSubscriber } from "@/lib/require-active-subscriber";
import PremiumCard from "@/components/PremiumCard";
import PremiumButton from "@/components/PremiumButton";

export const dynamic = "force-dynamic";

export default async function RequestsPage() {
  await requireActiveSubscriber("/requests");

  return (
    <main className="control-route-shell">
      <PremiumCard className="hero-refined control-route-hero">
        <p className="eyebrow">Generation planning</p>
        <h1 style={{ marginTop: 0, fontSize: 36, letterSpacing: "-0.02em" }}>Configure your monthly AI output</h1>
        <p className="wizard-copy">
          Tune your photo and video mix, keep your recurring plan aligned, and monitor live generation status.
        </p>
      </PremiumCard>
      <RequestsClient />

      <div style={{ marginTop: 16 }}>
        <PremiumButton href="/onboarding/intake" variant="secondary">
          Back to Setup Wizard
        </PremiumButton>
      </div>
    </main>
  );
}
