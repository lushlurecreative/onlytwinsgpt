"use client";

import PremiumButton from "@/components/PremiumButton";

type Props = { uploadedPhotos: string[] };

export default function ChipHero({ uploadedPhotos }: Props) {
  return (
    <section className="ch-section">
      <div className="ch-text">
        <p className="eyebrow">Your face. Powered by AI.</p>
        <h1 className="ch-headline">
          20+ scenarios.<br />
          <span style={{ color: "var(--accent)" }}>One subscription.</span>
        </h1>
        <p className="ch-sub">
          We train a custom AI model on your photos and deliver
          ready-to-post content for your social channels every month.
        </p>
        <div className="ch-photo-row">
          {uploadedPhotos.slice(0, 3).map((src, i) => (
            <div key={i} className="ch-photo-thumb">
              <img src={src} alt={`Your photo ${i + 1}`} />
            </div>
          ))}
          <span className="ch-photo-label">↑ Your photos going in</span>
        </div>
        <div className="cta-row" style={{ marginTop: 32 }}>
          <PremiumButton href="/pricing">Subscribe &amp; Get Started</PremiumButton>
          <PremiumButton href="/gallery" variant="secondary">See All Scenarios</PremiumButton>
        </div>
      </div>

      <div className="ch-visual">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/assets/aichip.jpeg"
          alt="AI Chip"
          className="ch-ref-img"
        />
      </div>
    </section>
  );
}
