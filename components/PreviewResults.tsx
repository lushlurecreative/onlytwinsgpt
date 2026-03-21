"use client";

import Link from "next/link";
import { motion } from "framer-motion";

interface Result {
  targetIdx: number;
  targetUrl: string;
  swappedUrl: string | null;
  success: boolean;
  error?: string;
}

type Props = {
  results: Result[];
  uploadedPhotos: string[];
};

export default function PreviewResults({ results, uploadedPhotos }: Props) {
  return (
    <section className="sg-section">
      <div className="sg-header">
        <h2 className="sg-title">Your AI preview. 3 scenarios.</h2>
        <p className="sg-sub">
          Here's you face-swapped into different scenarios. Subscribe to get 20+
          new scenarios every month.
        </p>
      </div>

      {/* Preview cards: before/after */}
      <div className="sg-grid">
        {results.map((result, i) => {
          const isFallback = !result.swappedUrl;

          return (
            <motion.div
              key={i}
              className="sg-card"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: i * 0.1 }}
            >
              <div
                style={{
                  position: "relative",
                  width: "100%",
                  height: "100%",
                  overflow: "hidden",
                  borderRadius: 8,
                  display: "flex",
                  background: "#000",
                }}
              >
                {/* Fallback: Show target image with error overlay */}
                {isFallback ? (
                  <>
                    <img
                      src={result.targetUrl}
                      alt={`Scenario ${i + 1}`}
                      style={{
                        width: "100%",
                        height: "100%",
                        objectFit: "cover",
                        display: "block",
                        opacity: 0.4,
                      }}
                    />
                    <div
                      style={{
                        position: "absolute",
                        inset: 0,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        background: "rgba(0,0,0,0.5)",
                        backdropFilter: "blur(4px)",
                      }}
                    >
                      <div
                        style={{
                          textAlign: "center",
                          padding: "16px",
                        }}
                      >
                        <p
                          style={{
                            color: "#fff",
                            fontSize: 13,
                            fontWeight: 600,
                            margin: "0 0 8px 0",
                          }}
                        >
                          Face swap unavailable
                        </p>
                        <p
                          style={{
                            color: "rgba(255,255,255,0.7)",
                            fontSize: 12,
                            margin: 0,
                          }}
                        >
                          {result.error ||
                            "Worker was busy. See scenario above."}
                        </p>
                      </div>
                    </div>
                  </>
                ) : (
                  /* Success: Show swapped image */
                  <img
                    src={result.swappedUrl}
                    alt={`Your AI in scenario ${i + 1}`}
                    style={{
                      width: "100%",
                      height: "100%",
                      objectFit: "cover",
                      display: "block",
                    }}
                  />
                )}
              </div>

              <div className="sg-foot">
                <span className="sg-foot-label">
                  {isFallback ? "Scenario" : "Your AI"}
                </span>
              </div>
            </motion.div>
          );
        })}
      </div>

      {/* CTA section */}
      <div style={{ textAlign: "center", marginTop: 48 }}>
        <p style={{ fontSize: "1.1rem", fontWeight: 600, marginBottom: 8 }}>
          Ready for your real AI twin?
        </p>
        <p className="muted" style={{ marginBottom: 24 }}>
          Subscribe and your first real batch is delivered within 24 hours.
          20+ scenarios. Every month.
        </p>
        <Link
          href="/pricing"
          style={{
            display: "inline-block",
            padding: "14px 36px",
            borderRadius: 99,
            background: "var(--accent, #7c3aed)",
            color: "#fff",
            fontWeight: 700,
            fontSize: "1rem",
            textDecoration: "none",
            letterSpacing: "0.02em",
          }}
        >
          Subscribe &amp; Get My AI Twin →
        </Link>
      </div>
    </section>
  );
}
