"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useRouter, useSearchParams } from "next/navigation";
import UploadGate from "@/components/UploadGate";
import ChipHero from "@/components/ChipHero";
import IPhoneMockup from "@/components/IPhoneMockup";
import ScenarioGrid from "@/components/ScenarioGrid";
import PremiumButton from "@/components/PremiumButton";

const STAGES = [
  "Analysing your photos…",
  "Detecting facial features…",
  "Mapping identity to scenarios…",
  "Compositing 20 scenes…",
  "Almost ready…",
];
const STAGE_MS = 600;

export default function HomeClient() {
  const params = useSearchParams();
  const router = useRouter();
  const [pendingPhotos, setPendingPhotos] = useState<string[] | null>(null);
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [stageIdx, setStageIdx] = useState(0);
  const [uploadedPhotos, setUploadedPhotos] = useState<string[] | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

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

  function startProcessing(photos: string[]) {
    setPendingPhotos(photos);
    setProcessing(true);
    setProgress(0);
    setStageIdx(0);

    const totalMs = STAGES.length * STAGE_MS;
    const tickMs = 40;
    let elapsed = 0;

    intervalRef.current = setInterval(() => {
      elapsed += tickMs;
      const pct = Math.min((elapsed / totalMs) * 100, 99);
      setProgress(pct);
      setStageIdx(Math.min(Math.floor(elapsed / STAGE_MS), STAGES.length - 1));

      if (elapsed >= totalMs) {
        clearInterval(intervalRef.current!);
        setProgress(100);
        setTimeout(() => {
          setProcessing(false);
          setUploadedPhotos(photos);
        }, 300);
      }
    }, tickMs);
  }

  return (
    <div>
      <AnimatePresence>
        {!pendingPhotos && (
          <UploadGate key="gate" onComplete={startProcessing} />
        )}
      </AnimatePresence>

      {/* Processing screen */}
      {processing && pendingPhotos && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          style={{
            minHeight: "100vh",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 32,
            padding: "0 24px",
          }}
        >
          {/* Uploaded photo row */}
          <div style={{ display: "flex", gap: 12 }}>
            {pendingPhotos.slice(0, 3).map((src, i) => (
              <div
                key={i}
                style={{
                  width: 72,
                  height: 72,
                  borderRadius: 12,
                  overflow: "hidden",
                  border: "2px solid var(--accent, #7c3aed)",
                  opacity: 0.85,
                }}
              >
                <img src={src} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              </div>
            ))}
          </div>

          {/* Stage label */}
          <div style={{ textAlign: "center" }}>
            <p className="eyebrow" style={{ marginBottom: 8 }}>Generating your preview</p>
            <AnimatePresence mode="wait">
              <motion.p
                key={stageIdx}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.25 }}
                style={{ fontSize: "1.1rem", fontWeight: 600, margin: 0 }}
              >
                {STAGES[stageIdx]}
              </motion.p>
            </AnimatePresence>
          </div>

          {/* Progress bar */}
          <div style={{ width: "100%", maxWidth: 360, height: 6, borderRadius: 99, background: "rgba(255,255,255,0.1)", overflow: "hidden" }}>
            <motion.div
              style={{ height: "100%", borderRadius: 99, background: "var(--accent, #7c3aed)" }}
              animate={{ width: `${progress}%` }}
              transition={{ duration: 0.2 }}
            />
          </div>

          <p className="muted" style={{ fontSize: 13, textAlign: "center", maxWidth: 280 }}>
            This preview shows the types of content we&apos;d generate for you. Subscribe to get your real personalised AI twin.
          </p>
        </motion.div>
      )}

      {/* Results */}
      {uploadedPhotos && !processing && (
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
            <h2 className="hp-cta-title">Ready for your real AI twin?</h2>
            <p className="hp-cta-sub">
              Subscribe and your first personalised content batch is delivered within 24 hours.
            </p>
            <div className="cta-row" style={{ justifyContent: "center" }}>
              <PremiumButton href="/pricing">Subscribe &amp; Get Started</PremiumButton>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
