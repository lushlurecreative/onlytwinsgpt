import LibraryClient from "@/app/library/LibraryClient";
import { requireActiveSubscriber } from "@/lib/require-active-subscriber";
import PremiumCard from "@/components/PremiumCard";
import PremiumButton from "@/components/PremiumButton";

export const dynamic = "force-dynamic";

export default async function LibraryPage() {
  await requireActiveSubscriber("/library");

  return (
    <main style={{ padding: 24, maxWidth: 980, margin: "0 auto" }}>
      <PremiumCard>
        <h1 style={{ marginTop: 0 }}>My Content Library</h1>
        <p style={{ opacity: 0.85 }}>View and download your completed images.</p>
      </PremiumCard>
      <div style={{ marginTop: 16 }}>
        <LibraryClient />
      </div>
      <div style={{ marginTop: 16 }}>
        <PremiumButton href="/requests">View Status</PremiumButton>
      </div>
    </main>
  );
}
