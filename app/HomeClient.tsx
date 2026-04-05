"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useRouter, useSearchParams } from "next/navigation";
import UploadGate from "@/components/UploadGate";
import ChipHero from "@/components/ChipHero";
import IPhoneMockup from "@/components/IPhoneMockup";
import PreviewResults from "@/components/PreviewResults";
import PremiumButton from "@/components/PremiumButton";

const STAGES = [
  "Analysing your face…",
  "Extracting identity features…",
  "Building your AI twin…",
  "Rendering your scene…",
  "Almost ready…",
];

interface SwapResult {
  targetIdx: number;
  targetUrl: string;
  swappedUrl: string | null;
  success: boolean;
  error?: string;
}

export default function HomeClient() {
  const params = useSearchParams();
  const router = useRouter();
  const [pendingPhotos, setPendingPhotos] = useState<string[] | null>(null);
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [stageIdx, setStageIdx] = useState(0);
  const [uploadedPhotos, setUploadedPhotos] = useState<string[] | null>(null);
  const [previewResults, setPreviewResults] = useState<SwapResult[] | null>(
    null
  );
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

  async function startProcessing(photos: string[], gender: string = "female") {
    setPendingPhotos(photos);
    setProcessing(true);
    setProgress(0);
    setStageIdx(0);
    setPreviewResults(null);

    // Start progress animation immediately (runs alongside the API call)
    const ESTIMATED_MS = 45_000; // ~40s for FLUX generation + face swap
    const tickMs = 200;
    let elapsed = 0;
    intervalRef.current = setInterval(() => {
      elapsed += tickMs;
      // Progress caps at 95% until the API returns
      const pct = Math.min((elapsed / ESTIMATED_MS) * 95, 95);
      setProgress(pct);
      const stageProgress = elapsed / ESTIMATED_MS;
      setStageIdx(Math.min(Math.floor(stageProgress * STAGES.length), STAGES.length - 1));
    }, tickMs);

    try {
      console.log("[homepage] Calling generate-swap API with", photos.length, "photos");

      const apiResponse = await fetch("/api/preview/generate-swap", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userPhotoUrls: photos, gender }),
      });

      // Stop the animation
      if (intervalRef.current) clearInterval(intervalRef.current);

      if (!apiResponse.ok) {
        console.error("[homepage] API error:", apiResponse.status);
        setProgress(100);
        setProcessing(false);
        setUploadedPhotos(photos);
        return;
      }

      const apiResult = await apiResponse.json();
      console.log("[homepage] generate-swap results:", apiResult);

      // Fast-forward to 100% and show results
      setProgress(100);
      setTimeout(() => {
        setProcessing(false);
        setUploadedPhotos(photos);
        setPreviewResults(apiResult.results || []);
      }, 400);
    } catch (error) {
      console.error("[homepage] Processing error:", error);
      if (intervalRef.current) clearInterval(intervalRef.current);
      setProgress(100);
      setProcessing(false);
      setUploadedPhotos(photos);
    }
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
          {previewResults && previewResults.length > 0 ? (
            <PreviewResults
              results={previewResults}
              uploadedPhotos={uploadedPhotos}
            />
          ) : (
            <div style={{ textAlign: "center", padding: "40px 24px" }}>
              <p style={{ color: "var(--text-muted)" }}>
                Preview generation failed. Please try again.
              </p>
            </div>
          )}

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
