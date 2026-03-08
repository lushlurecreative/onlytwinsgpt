import TrainingPhotosClient from "@/app/training/photos/TrainingPhotosClient";
import { requireActiveSubscriber } from "@/lib/require-active-subscriber";
import PremiumCard from "@/components/PremiumCard";
import PremiumButton from "@/components/PremiumButton";

export const dynamic = "force-dynamic";

export default async function TrainingPhotosPage() {
  await requireActiveSubscriber("/training/photos");

  return (
    <main style={{ padding: 24, maxWidth: 900, margin: "0 auto" }}>
      <PremiumCard className="hero-refined">
        <h1 style={{ marginTop: 0, fontSize: 34, letterSpacing: "-0.02em" }}>Upload Training Photos</h1>
        <p style={{ opacity: 0.85, maxWidth: 680 }}>
          Upload the photos we&apos;ll use to train your twin and generate your selected package. Minimum 10,
          maximum 50 photos.
        </p>
      </PremiumCard>

      <TrainingPhotosClient />

      <section style={{ marginTop: 16 }}>
        <PremiumCard>
          <h2 style={{ marginTop: 0 }}>Photo checklist</h2>
          <ul style={{ marginBottom: 0 }}>
            <li>upload at least 10 and no more than 50 training photos</li>
            <li>high-quality photos</li>
            <li>good lighting</li>
            <li>face clearly visible</li>
            <li>multiple angles</li>
            <li>mix of close-up, mid-shot, and full-body framing</li>
            <li>varied outfits and expressions, no heavy filters</li>
          </ul>
        </PremiumCard>
      </section>

      <section style={{ marginTop: 16 }}>
        <PremiumCard>
          <h2 style={{ marginTop: 0 }}>Set Preferences</h2>
          <p style={{ marginBottom: 0 }}>
            Once your photos are uploaded, complete onboarding intake so the team has your exact style,
            bio, constraints, and delivery preferences before generation starts.
          </p>
        </PremiumCard>
      </section>

      <div style={{ marginTop: 16 }}>
        <PremiumButton href="/onboarding/intake">Set Preferences</PremiumButton>
      </div>
    </main>
  );
}
