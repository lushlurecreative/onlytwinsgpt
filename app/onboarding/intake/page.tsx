import { requireActiveSubscriber } from "@/lib/require-active-subscriber";
import OnboardingIntakeClient from "@/app/onboarding/intake/OnboardingIntakeClient";
import PremiumCard from "@/components/PremiumCard";

export const dynamic = "force-dynamic";

export default async function OnboardingIntakePage() {
  await requireActiveSubscriber("/onboarding/intake");

  return (
    <main style={{ padding: 24, maxWidth: 980, margin: "0 auto" }}>
      <PremiumCard className="hero-refined">
        <h1 style={{ marginTop: 0, fontSize: 34, letterSpacing: "-0.02em" }}>Onboarding Intake</h1>
        <p style={{ opacity: 0.86, maxWidth: 760 }}>
          Add everything your team should know before generation starts. Include identity details, bio
          direction, hard rules, and any custom style guidance.
        </p>
      </PremiumCard>
      <OnboardingIntakeClient />
    </main>
  );
}
