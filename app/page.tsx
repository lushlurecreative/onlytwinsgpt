"use client";

import { MARKETING_MESSAGE_MAP } from "@/lib/marketing-message-map";
import BeforeAfterSlider from "@/components/BeforeAfterSlider";
import PremiumCard from "@/components/PremiumCard";
import PremiumButton from "@/components/PremiumButton";
import AICapabilitiesGallery from "@/components/AICapabilitiesGallery";
import { homeGalleryPreviewItems } from "@/lib/gallery-data";
import { featuredResultsItems } from "@/lib/results-data";
import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

function HomeContent() {
  const params = useSearchParams();
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [hasSession, setHasSession] = useState(false);

  useEffect(() => {
    const code = params.get("code");

    if (code) {
      router.replace(`/auth/callback?code=${code}`);
    }
  }, [params, router]);

  useEffect(() => {
    const loadSession = async () => {
      const { data } = await supabase.auth.getUser();
      setHasSession(!!data.user);
    };
    void loadSession();
  }, [supabase]);

  return (
    <div>
      <section className="hero hero-refined">
        <p className="eyebrow">{MARKETING_MESSAGE_MAP.positioning.eyebrow}</p>
        <h1>
          {hasSession
            ? "Your OnlyTwins control center is ready."
            : MARKETING_MESSAGE_MAP.positioning.headline}
        </h1>
        <p>
          {hasSession
            ? "Your workspace is active. Open your dashboard to manage onboarding, training, and generation."
            : MARKETING_MESSAGE_MAP.positioning.subheadline}
        </p>
        <div className="cta-row">
          {hasSession ? (
            <PremiumButton href="/dashboard">Open Dashboard</PremiumButton>
          ) : (
            <PremiumButton href={MARKETING_MESSAGE_MAP.cta.primaryHref}>
              {MARKETING_MESSAGE_MAP.cta.primaryLabel}
            </PremiumButton>
          )}
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

      <section className="section">
        <PremiumCard className="hero-refined">
          <p className="eyebrow">Capabilities Preview</p>
          <h2 style={{ marginTop: 0, marginBottom: 8 }}>Style Range Across SFW, NSFW, Social, and Niche Aesthetics</h2>
          <p className="section-copy" style={{ marginBottom: 14 }}>
            Explore a mixed preview across creator, agency, adult, non-adult, and custom concept outputs.
          </p>
          <AICapabilitiesGallery items={homeGalleryPreviewItems} maxItems={8} previewMode />
          <div className="cta-row" style={{ marginTop: 16 }}>
            <PremiumButton href="/gallery">View Full Capabilities Gallery</PremiumButton>
          </div>
        </PremiumCard>
      </section>

      <section className="section">
        <PremiumCard className="hero-refined">
          <p className="eyebrow">Transformation Results</p>
          <h2 style={{ marginTop: 0, marginBottom: 8 }}>Original to Twin Quality Showcase</h2>
          <p className="section-copy" style={{ marginBottom: 14 }}>
            Compare source training photos with final AI-generated outputs across multiple visual directions.
          </p>
          {featuredResultsItems.length > 0 ? (
            <div className="results-preview-grid">
              {featuredResultsItems.slice(0, 4).map((item) => (
                <div key={item.id} className="premium-card">
                  <BeforeAfterSlider beforeSrc={item.before} afterSrc={item.after} beforeLabel="Original" afterLabel="Twin" />
                  <p className="section-copy" style={{ marginTop: 10, fontSize: 14 }}>
                    {item.title}
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <p className="section-copy" style={{ marginBottom: 0 }}>
              Add your first before/after pairs in `lib/results-data.ts` to populate this section.
            </p>
          )}
          <div className="cta-row" style={{ marginTop: 16 }}>
            <PremiumButton href="/results">View More Results</PremiumButton>
          </div>
        </PremiumCard>
      </section>

      <section className="section split">
        <PremiumCard title="Built for consistency">
          <p className="section-copy">
            Calm operations, predictable quality, and a cleaner workflow than ad-hoc AI tool chains.
          </p>
          <div className="cta-row" style={{ marginTop: 12 }}>
            <PremiumButton href="/market-ad-hoc" variant="secondary">
              See Typical Market AI Quality
            </PremiumButton>
          </div>
        </PremiumCard>
        <PremiumCard title="Production visibility">
          <p className="section-copy">
            Track each stage from intake to final asset delivery in your customer control center.
          </p>
        </PremiumCard>
      </section>

      <section className="section hero hero-refined">
        <p className="eyebrow">{hasSession ? "Welcome Back" : "Ready To Start"}</p>
        <h2>{hasSession ? "Continue in your dashboard." : "Start your AI production system in minutes."}</h2>
        <p>
          {hasSession
            ? "Your subscription is active. Continue your setup and monitor progress from one place."
            : "Subscribe, upload photos, and let the system run quietly in the background."}
        </p>
        <div className="cta-row">
          {hasSession ? (
            <PremiumButton href="/dashboard">Open Dashboard</PremiumButton>
          ) : (
            <PremiumButton href={MARKETING_MESSAGE_MAP.cta.primaryHref}>
              {MARKETING_MESSAGE_MAP.cta.primaryLabel}
            </PremiumButton>
          )}
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
