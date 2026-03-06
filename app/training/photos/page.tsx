import TrainingPhotosClient from "@/app/training/photos/TrainingPhotosClient";
import { requireActiveSubscriber } from "@/lib/require-active-subscriber";
import PremiumCard from "@/components/PremiumCard";
import PremiumButton from "@/components/PremiumButton";

export const dynamic = "force-dynamic";

export default async function TrainingPhotosPage() {
  await requireActiveSubscriber("/training/photos");

  return (
    <main style={{ padding: 24, maxWidth: 900, margin: "0 auto" }}>
      <PremiumCard>
        <h1 style={{ marginTop: 0 }}>Upload Training Photos</h1>
        <p style={{ opacity: 0.85 }}>
          Upload the photos we'll use to train your twin and generate your selected package.
        </p>
      </PremiumCard>

      <TrainingPhotosClient />

      <section style={{ marginTop: 16 }}>
        <PremiumCard>
        <h2 style={{ marginTop: 0 }}>Photo checklist</h2>
        <ul style={{ marginBottom: 0 }}>
          <li>high-quality photos</li>
          <li>good lighting</li>
          <li>face clearly visible</li>
          <li>multiple angles</li>
        </ul>
        </PremiumCard>
      </section>

      <section style={{ marginTop: 16 }}>
        <PremiumCard>
        <h2 style={{ marginTop: 0 }}>What happens next</h2>
        <p style={{ marginBottom: 0 }}>
          Once your photos are uploaded, we'll review them and begin training your twin.
        </p>
        </PremiumCard>
      </section>

      <div style={{ marginTop: 16 }}>
        <PremiumButton href="/requests">Set Preferences</PremiumButton>
      </div>
    </main>
  );
}
