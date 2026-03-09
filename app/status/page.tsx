import PremiumCard from "@/components/PremiumCard";
import { requireActiveSubscriber } from "@/lib/require-active-subscriber";
import StatusClient from "./StatusClient";

export const dynamic = "force-dynamic";

export default async function StatusPage() {
  await requireActiveSubscriber("/status");

  return (
    <main style={{ padding: 24, maxWidth: 900, margin: "0 auto" }}>
      <PremiumCard className="hero-refined">
        <h1 style={{ marginTop: 0, fontSize: 34, letterSpacing: "-0.02em" }}>Content Generation Status</h1>
        <p style={{ opacity: 0.85, maxWidth: 680 }}>
          Track your current generation pipeline from queued to delivered.
        </p>
      </PremiumCard>
      <div style={{ marginTop: 16 }}>
        <StatusClient />
      </div>
    </main>
  );
}
