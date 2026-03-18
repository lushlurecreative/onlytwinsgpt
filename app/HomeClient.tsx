"use client";

import { useEffect, useState } from "react";
import { AnimatePresence } from "framer-motion";
import { useRouter, useSearchParams } from "next/navigation";
import UploadGate from "@/components/UploadGate";
import ChipHero from "@/components/ChipHero";
import IPhoneMockup from "@/components/IPhoneMockup";
import ScenarioGrid from "@/components/ScenarioGrid";
import PremiumButton from "@/components/PremiumButton";

export default function HomeClient() {
  const params = useSearchParams();
  const router = useRouter();
  const [uploadedPhotos, setUploadedPhotos] = useState<string[] | null>(null);

  useEffect(() => {
    const code = params.get("code");
    if (code) router.replace(`/auth/callback?code=${code}`);
  }, [params, router]);

  useEffect(() => {
    return () => {
      uploadedPhotos?.forEach((url) => {
        if (url.startsWith("blob:")) URL.revokeObjectURL(url);
      });
    };
  }, [uploadedPhotos]);

  return (
    <div>
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
          <section className="hiw-section">
            <div className="hiw-header">
              <h2 className="hiw-title">Three steps to your AI twin</h2>
            </div>
            <div className="hiw-grid">
              <div>
                <div className="hiw-step-num">01</div>
                <h3 className="hiw-step-title">Upload photos</h3>
                <p className="hiw-step-copy">Share 10–20 high-quality photos once. No camera setup, no studio required.</p>
              </div>
              <div>
                <div className="hiw-step-num">02</div>
                <h3 className="hiw-step-title">We train your model</h3>
                <p className="hiw-step-copy">Our AI builds a personalised twin model from your photos within 24 hours.</p>
              </div>
              <div>
                <div className="hiw-step-num">03</div>
                <h3 className="hiw-step-title">Receive content monthly</h3>
                <p className="hiw-step-copy">20+ finished AI scenarios delivered to your vault every month. Ready to post.</p>
              </div>
            </div>
          </section>

          {/* Subscribe CTA */}
          <section className="hp-cta-section">
            <h2 className="hp-cta-title">One subscription.<br />Endless content.</h2>
            <p className="hp-cta-sub">
              Subscribe now and your first content batch is ready within 24 hours of upload.
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
