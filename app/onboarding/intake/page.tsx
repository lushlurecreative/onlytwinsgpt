import { requireActiveSubscriber } from "@/lib/require-active-subscriber";
import OnboardingIntakeClient from "@/app/onboarding/intake/OnboardingIntakeClient";
import PremiumCard from "@/components/PremiumCard";

export const dynamic = "force-dynamic";

export default async function OnboardingIntakePage() {
  await requireActiveSubscriber("/onboarding/intake");

  return (
    <main className="control-route-shell">
      <PremiumCard className="hero-refined control-route-hero">
        <p className="eyebrow">Guided setup wizard</p>
        <h1 style={{ marginTop: 0, fontSize: 36, letterSpacing: "-0.02em" }}>Configure your twin profile</h1>
        <p className="wizard-copy">
          Complete your premium setup once. This information powers identity consistency, generation quality, and
          delivery precision.
        </p>
      </PremiumCard>
      <OnboardingIntakeClient />
    </main>
  );
}
