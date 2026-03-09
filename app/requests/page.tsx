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
        <h1 style={{ marginTop: 0, fontSize: 36, letterSpacing: "-0.02em" }}>Recurring monthly request planner</h1>
        <p className="wizard-copy">
          Manage recurring request mix, billing-cycle timing, and plan allowance in one premium workspace.
        </p>
      </PremiumCard>
      <RequestsClient />

      <div style={{ marginTop: 16 }}>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <PremiumButton href="/onboarding/intake" variant="secondary">
            Back to Setup Wizard
          </PremiumButton>
          <PremiumButton href="/upgrade">Upgrade plan</PremiumButton>
        </div>
      </div>
    </main>
  );
}
