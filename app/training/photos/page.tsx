import Link from "next/link";
import TrainingPhotosClient from "@/app/training/photos/TrainingPhotosClient";
import { requireActiveSubscriber } from "@/lib/require-active-subscriber";

export const dynamic = "force-dynamic";

export default async function TrainingPhotosPage() {
  await requireActiveSubscriber("/training/photos");

  return (
    <main style={{ padding: 24, maxWidth: 900, margin: "0 auto" }}>
      <h1 style={{ marginTop: 0 }}>Upload Training Photos</h1>
      <p style={{ opacity: 0.85 }}>
        Upload the photos we'll use to train your twin and generate your selected package.
      </p>

      <TrainingPhotosClient />

      <section style={{ border: "1px solid #333", borderRadius: 12, padding: 16, marginTop: 16 }}>
        <h2 style={{ marginTop: 0 }}>Photo checklist</h2>
        <ul style={{ marginBottom: 0 }}>
          <li>high-quality photos</li>
          <li>good lighting</li>
          <li>face clearly visible</li>
          <li>multiple angles</li>
        </ul>
      </section>

      <section style={{ border: "1px solid #333", borderRadius: 12, padding: 16, marginTop: 16 }}>
        <h2 style={{ marginTop: 0 }}>What happens next</h2>
        <p style={{ marginBottom: 0 }}>
          Once your photos are uploaded, we'll review them and begin training your twin.
        </p>
      </section>

      <div style={{ marginTop: 16 }}>
        <Link href="/requests" className="btn btn-primary">
          Set Preferences
        </Link>
      </div>
    </main>
  );
}
