import LibraryClient from "@/app/library/LibraryClient";
import { requireActiveSubscriber } from "@/lib/require-active-subscriber";

export const dynamic = "force-dynamic";

export default async function LibraryPage() {
  await requireActiveSubscriber("/library");

  return (
    <main style={{ padding: "32px 24px", maxWidth: 1100, margin: "0 auto" }}>
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ margin: 0, fontSize: "2rem", fontWeight: 700, letterSpacing: "-0.02em" }}>My Content</h1>
        <p style={{ margin: "6px 0 0", opacity: 0.6, fontSize: 15 }}>
          Your AI-generated images and videos — download to your device anytime.
        </p>
      </div>
      <LibraryClient />
    </main>
  );
}
