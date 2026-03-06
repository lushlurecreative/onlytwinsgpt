"use client";

import { MARKETING_MESSAGE_MAP } from "@/lib/marketing-message-map";
import BeforeAfterSlider from "@/app/components/BeforeAfterSlider";
import PremiumCard from "@/components/PremiumCard";
import PremiumButton from "@/components/PremiumButton";
import { Suspense, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";

function HomeContent() {
  const params = useSearchParams();
  const router = useRouter();

  useEffect(() => {
    const code = params.get("code");

    if (code) {
      router.replace(`/auth/callback?code=${code}`);
    }
  }, [params, router]);

  return (
    <div>
      <section className="hero hero-refined">
        <p className="eyebrow">{MARKETING_MESSAGE_MAP.positioning.eyebrow}</p>
        <h1>{MARKETING_MESSAGE_MAP.positioning.headline}</h1>
        <p>{MARKETING_MESSAGE_MAP.positioning.subheadline}</p>
        <div className="hero-slider-wrap">
          <BeforeAfterSlider
            beforeSrc="/hero-before.svg"
            afterSrc="/hero-after.svg"
            beforeLabel="User Upload"
            afterLabel="AI Beach Scene"
          />
        </div>
        <div className="cta-row">
          <PremiumButton href={MARKETING_MESSAGE_MAP.cta.primaryHref}>
            {MARKETING_MESSAGE_MAP.cta.primaryLabel}
          </PremiumButton>
          <PremiumButton href="/how-it-works" variant="secondary">
            See How It Works
          </PremiumButton>
        </div>
      </section>

      <section className="section">
        <h2 className="section-title">A quiet AI system, running behind your brand</h2>
        <p className="section-copy">
          OnlyTwins is designed like a premium production system: upload once, train once, then receive
          consistent outputs without constant manual prompting.
        </p>
      </section>

      <section className="feature-grid section">
        <PremiumCard title="Upload" subtitle="Share high-quality photos once." />
        <PremiumCard title="Train" subtitle="We build your personalized twin model." />
        <PremiumCard title="Generate" subtitle="Requests are processed through your AI pipeline." />
        <PremiumCard title="Deliver" subtitle="Finished assets appear in your private library." />
      </section>

      <section className="section split">
        <PremiumCard title="Built for consistency">
          <p className="section-copy">
            Calm operations, predictable quality, and a cleaner workflow than ad-hoc AI tool chains.
          </p>
        </PremiumCard>
        <PremiumCard title="Production visibility">
          <p className="section-copy">
            Track each stage from intake to final asset delivery in your customer control center.
          </p>
        </PremiumCard>
      </section>

      <section className="section hero hero-refined">
        <p className="eyebrow">Ready To Start</p>
        <h2>Start your AI production system in minutes.</h2>
        <p>
          Subscribe, upload photos, and let the system run quietly in the background.
        </p>
        <div className="cta-row">
          <PremiumButton href={MARKETING_MESSAGE_MAP.cta.primaryHref}>
            {MARKETING_MESSAGE_MAP.cta.primaryLabel}
          </PremiumButton>
          <PremiumButton href="/results" variant="secondary">
            See Results
          </PremiumButton>
        </div>
      </section>
    </div>
  );
}

export default function Home() {
  return (
    <Suspense fallback={<div />}>
      <HomeContent />
    </Suspense>
  );
}
