 "use client";

import { useState } from "react";
import PremiumButton from "@/components/PremiumButton";
import BeforeAfterSlider from "@/components/BeforeAfterSlider";
import { resultsItems } from "@/lib/results-data";

export default function ResultsPage() {
  const [revealedNSFW, setRevealedNSFW] = useState<Record<string, boolean>>({});

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
          <PremiumButton href="/pricing">Start Subscription</PremiumButton>
          <PremiumButton href="/gallery" variant="secondary">
            Explore Capabilities
          </PremiumButton>
        </div>
      </section>

      <section className="section">
        <div className="results-showcase-grid">
          {resultsItems.map((item) => {
            const hiddenNSFW = !!item.nsfw && !revealedNSFW[item.id];
            return (
              <article className="premium-card results-showcase-card" key={item.id}>
                <div className={`results-slider-wrap ${hiddenNSFW ? "is-nsfw-hidden" : ""}`.trim()}>
                  <BeforeAfterSlider beforeSrc={item.before} afterSrc={item.after} beforeLabel="Before" afterLabel="After" />
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
