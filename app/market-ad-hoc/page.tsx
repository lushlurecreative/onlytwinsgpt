import PremiumCard from "@/components/PremiumCard";

const weakSignals = [
  "Identity drift between outputs",
  "Inconsistent skin texture and lighting",
  "Hands/fingers and edge artifacts",
  "Prompt randomness with weak style lock",
  "Mismatched face/body proportions",
  "Unstable video continuity frame-to-frame",
];

export default function MarketAdHocPage() {
  return (
    <main style={{ padding: 24, maxWidth: 1040, margin: "0 auto" }}>
      <section className="hero hero-refined">
        <p className="eyebrow">Market Comparison</p>
        <h1>Typical Ad-Hoc AI Output Quality</h1>
        <p>
          This page highlights the common issues seen in ad-hoc AI content pipelines used across the market.
          Use this as the baseline contrast against the consistency-focused OnlyTwins workflow.
        </p>
      </section>

      <section className="section feature-grid">
        {weakSignals.map((signal) => (
          <PremiumCard key={signal} title={signal}>
            <p className="section-copy" style={{ marginBottom: 0 }}>
              Common in unstructured prompt workflows without stable identity controls, QA checks, or pipeline
              standards.
            </p>
          </PremiumCard>
        ))}
      </section>
    </main>
  );
}
