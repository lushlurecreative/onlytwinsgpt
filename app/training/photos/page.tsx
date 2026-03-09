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
            <li>include a mix of full body and waist-up framing</li>
            <li>include facing forward, facing left, and facing right angles</li>
            <li>use good lighting and clear facial visibility</li>
            <li>include varied outfits and expressions with no heavy filters</li>
            <li>avoid bad photos: hats, phones in frame, hands blocking face/body, other people in photo</li>
          </ul>
        </PremiumCard>
      </section>

      <section style={{ marginTop: 16 }}>
        <PremiumCard>
          <h2 style={{ marginTop: 0 }}>Next Steps</h2>
          <p style={{ marginTop: 12, marginBottom: 0 }}>
            Once your photos are uploaded, we review quality and begin training your twin pipeline.
          </p>
        </PremiumCard>
      </section>

      <div style={{ marginTop: 16 }}>
        <PremiumButton href="/requests">Next Step: Choose Generation Preferences</PremiumButton>
      </div>
    </main>
  );
}
