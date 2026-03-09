import LibraryClient from "@/app/library/LibraryClient";
import { requireActiveSubscriber } from "@/lib/require-active-subscriber";
import PremiumCard from "@/components/PremiumCard";
import PremiumButton from "@/components/PremiumButton";

export const dynamic = "force-dynamic";

export default async function LibraryPage() {
  await requireActiveSubscriber("/library");

  return (
    <main style={{ padding: 24, maxWidth: 980, margin: "0 auto" }}>
      <PremiumCard className="hero-refined">
        <h1 style={{ marginTop: 0, fontSize: 34, letterSpacing: "-0.02em" }}>My AI Generated Content</h1>
        <p style={{ opacity: 0.85, maxWidth: 680 }}>
          Your completed assets are stored here and ready for download.
        </p>
      </PremiumCard>
      <div style={{ marginTop: 16 }}>
        <LibraryClient />
      </div>
      <div style={{ marginTop: 16 }}>
        <PremiumButton href="/status">View Status</PremiumButton>
      </div>
    </main>
  );
}
