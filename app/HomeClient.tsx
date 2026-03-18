"use client";

import { useEffect, useState } from "react";
import { AnimatePresence } from "framer-motion";
import { useRouter, useSearchParams } from "next/navigation";
import UploadGate from "@/components/UploadGate";
import ChipHero from "@/components/ChipHero";
import IPhoneMockup from "@/components/IPhoneMockup";
import ScenarioGrid from "@/components/ScenarioGrid";
import PremiumCard from "@/components/PremiumCard";
import PremiumButton from "@/components/PremiumButton";

export default function HomeClient() {
  const params = useSearchParams();
  const router = useRouter();
  const [uploadedPhotos, setUploadedPhotos] = useState<string[] | null>(null);

  useEffect(() => {
    const code = params.get("code");
    if (code) {
      router.replace(`/auth/callback?code=${code}`);
    }
  }, [params, router]);

  // Revoke blob URLs on unmount
  useEffect(() => {
    return () => {
      if (uploadedPhotos) {
        uploadedPhotos.forEach((url) => {
          if (url.startsWith("blob:")) URL.revokeObjectURL(url);
        });
      }
    };
  }, [uploadedPhotos]);

  return (
    <div className="homepage">
      <AnimatePresence>
        {!uploadedPhotos && (
          <UploadGate key="gate" onComplete={(photos) => setUploadedPhotos(photos)} />
        )}
      </AnimatePresence>

      {uploadedPhotos && (
        <>
          <ChipHero uploadedPhotos={uploadedPhotos} />
          <IPhoneMockup uploadedPhotos={uploadedPhotos} />
          <ScenarioGrid uploadedPhotos={uploadedPhotos} />

          {/* How It Works */}
          <section className="section how-it-works-section">
            <div style={{ textAlign: "center", marginBottom: 40 }}>
              <p className="eyebrow">Simple by design</p>
              <h2 className="section-title">Three steps to your AI twin</h2>
            </div>
            <div className="how-it-works-grid">
              <PremiumCard>
                <div className="hiw-step-num">01</div>
                <h3 className="hiw-step-title">Upload photos</h3>
                <p className="section-copy">
                  Share 10–20 high-quality photos once. No camera setup, no studio.
                </p>
              </PremiumCard>
              <PremiumCard>
                <div className="hiw-step-num">02</div>
                <h3 className="hiw-step-title">We train your model</h3>
                <p className="section-copy">
                  Our AI builds a personalised twin model from your photos within 24 hours.
                </p>
              </PremiumCard>
              <PremiumCard>
                <div className="hiw-step-num">03</div>
                <h3 className="hiw-step-title">Receive content monthly</h3>
                <p className="section-copy">
                  20+ finished AI scenarios delivered to your vault every month. Ready to post.
                </p>
              </PremiumCard>
            </div>
          </section>

          {/* Subscribe CTA */}
          <section className="section hero hero-refined cta-final">
            <p className="eyebrow">Start today</p>
            <h2 className="section-title">One subscription. Endless content.</h2>
            <p className="section-copy" style={{ maxWidth: 480, margin: "0 auto 32px" }}>
              Subscribe now and your first content batch will be ready within 24 hours of upload.
            </p>
            <div className="cta-row" style={{ justifyContent: "center" }}>
              <PremiumButton href="/pricing">Subscribe &amp; Get Started</PremiumButton>
              <PremiumButton href="/gallery" variant="secondary">Browse All Scenarios</PremiumButton>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
