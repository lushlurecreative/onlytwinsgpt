"use client";

import { useState } from "react";
import PremiumButton from "@/components/PremiumButton";
import BeforeAfterSlider from "@/components/BeforeAfterSlider";
import { resultsItemTemplate, resultsItems } from "@/lib/results-data";

export default function ResultsMarketing() {
  const [revealedNSFW, setRevealedNSFW] = useState<Record<string, boolean>>({});
  const hasResults = resultsItems.length > 0;

  return (
    <main style={{ padding: 24, maxWidth: 1120, margin: "0 auto" }}>
      <section className="hero hero-refined">
        <p className="eyebrow">OnlyTwins Results</p>
        <h1>See the Transformation</h1>
        <p>From source photos to premium AI-generated twin results.</p>
        <p>
          Upload your real training photos and receive high-quality generated outputs across styles, moods,
          and formats with consistent identity and premium detail.
        </p>
        <div className="cta-row">
          <PremiumButton href="/gallery" variant="secondary">
            Explore Capabilities
          </PremiumButton>
        </div>
      </section>

      <section className="section">
        {!hasResults ? (
          <div className="premium-card" style={{ marginBottom: 14 }}>
            <p className="eyebrow">Setup Needed</p>
            <p className="section-copy" style={{ margin: 0 }}>
              No before/after pairs are configured yet. Add files to `/public/results/before/` and
              `/public/results/after/`, then add entries in `lib/results-data.ts` using this structure:
            </p>
            <pre className="results-template">{`{
  id: "${resultsItemTemplate.id}",
  before: "${resultsItemTemplate.before}",
  after: "${resultsItemTemplate.after}",
  title: "${resultsItemTemplate.title}",
  category: "${resultsItemTemplate.category}",
  description: "${resultsItemTemplate.description}"
}`}</pre>
          </div>
        ) : null}
        {hasResults ? (
          <div className="results-showcase-grid">
            {resultsItems.map((item) => {
              const hiddenNSFW = !!item.nsfw && !revealedNSFW[item.id];
              return (
                <article className="premium-card results-showcase-card" key={item.id}>
                  <div className={`results-slider-wrap ${hiddenNSFW ? "is-nsfw-hidden" : ""}`.trim()}>
                    <BeforeAfterSlider beforeSrc={item.before} afterSrc={item.after} beforeLabel="Original" afterLabel="Twin" />
                    {hiddenNSFW ? (
                      <button
                        type="button"
                        className="results-nsfw-overlay"
                        onClick={() => setRevealedNSFW((prev) => ({ ...prev, [item.id]: true }))}
                      >
                        <strong>NSFW Example</strong>
                        <span>Click to reveal</span>
                      </button>
                    ) : null}
                  </div>
                  <div className="results-copy">
                    <span className="ai-gallery-category">{item.category}</span>
                    <h3>{item.title}</h3>
                    <p>{item.description}</p>
                  </div>
                </article>
              );
            })}
          </div>
        ) : null}
      </section>

      <section className="section premium-card">
        <p className="eyebrow">Why The Transformation Works</p>
        <h2 style={{ marginTop: 0 }}>Built for quality, consistency, and control</h2>
        <div className="results-trust-grid">
          <div className="results-trust-item">Trained from your photos</div>
          <div className="results-trust-item">Customized to your style</div>
          <div className="results-trust-item">High-quality output</div>
          <div className="results-trust-item">Multiple visual directions</div>
          <div className="results-trust-item">Private workflow</div>
        </div>
      </section>
    </main>
  );
}
