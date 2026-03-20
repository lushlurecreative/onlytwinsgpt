"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { useEffect, useState, useCallback } from "react";
import { galleryItems } from "@/lib/gallery-data";

type Props = { uploadedPhotos: string[] };

const sceneItems = galleryItems.filter((i) => i.type === "image").slice(0, 20);

type SwappedImage = {
  url: string;
  loading: boolean;
  fallback: boolean;
};

export default function ScenarioGrid({ uploadedPhotos }: Props) {
  const userPhoto = uploadedPhotos[0];
  const [swappedImages, setSwappedImages] = useState<Record<number, SwappedImage>>({});
  const [userPhotoBase64, setUserPhotoBase64] = useState<string>("");

  // Convert uploaded photo to base64
  useEffect(() => {
    const convertToBase64 = async () => {
      try {
        const response = await fetch(userPhoto);
        const blob = await response.blob();
        const reader = new FileReader();
        reader.onloadend = () => {
          const base64 = reader.result as string;
          // Remove the data:image/...;base64, prefix
          const base64Data = base64.split(",")[1] || base64;
          setUserPhotoBase64(base64Data);
        };
        reader.readAsDataURL(blob);
      } catch (error) {
        console.error("Error converting photo to base64:", error);
      }
    };

    if (userPhoto && userPhoto.startsWith("blob:")) {
      convertToBase64();
    }
  }, [userPhoto]);

  // Perform face swaps for visible scenarios
  const performFaceSwap = useCallback(
    async (index: number, scenarioUrl: string) => {
      if (!userPhotoBase64 || swappedImages[index]?.url) return;

      // Set loading state
      setSwappedImages((prev) => ({
        ...prev,
        [index]: { url: scenarioUrl, loading: true, fallback: false },
      }));

      try {
        const response = await fetch("/api/preview/faceswap", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            userPhotoBase64,
            scenarioImageUrl: scenarioUrl,
          }),
        });

        if (response.ok) {
          const result = await response.json();
          setSwappedImages((prev) => ({
            ...prev,
            [index]: {
              url: result.swappedImageUrl || scenarioUrl,
              loading: false,
              fallback: result.fallback || false,
            },
          }));
        } else {
          // Fallback to original scenario
          setSwappedImages((prev) => ({
            ...prev,
            [index]: { url: scenarioUrl, loading: false, fallback: true },
          }));
        }
      } catch (error) {
        console.error(`Face swap error for scenario ${index}:`, error);
        // Fallback to original scenario
        setSwappedImages((prev) => ({
          ...prev,
          [index]: { url: scenarioUrl, loading: false, fallback: true },
        }));
      }
    },
    [userPhotoBase64, swappedImages]
  );

  return (
    <section className="sg-section">
      <div className="sg-header">
        <h2 className="sg-title">20+ scenarios. Your face in all of them.</h2>
        <p className="sg-sub">
          This is the style of content we generate. Subscribe to receive these with <em>your</em> face composited in — delivered to your vault every month.
        </p>
      </div>

      <div className="sg-grid">
        {sceneItems.map((item, i) => {
          const swapped = swappedImages[i];
          const displayImageUrl = swapped?.url || item.src;
          const isLoading = swapped?.loading;

          // Trigger face swap when item is about to be visible
          const onViewportEnter = () => {
            if (userPhotoBase64 && !swappedImages[i]) {
              performFaceSwap(i, item.src);
            }
          };

          return (
            <motion.div
              key={i}
              className={`sg-card${item.nsfw ? " sg-card-nsfw" : ""}`}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-30px" }}
              transition={{ duration: 0.4, delay: (i % 4) * 0.06 }}
              onViewportEnter={onViewportEnter}
            >
              {/* Before/after split: user photo → AI scene (or face-swapped) */}
              <div className="sg-split">
                {/* Left — user's photo */}
                <div className="sg-split-you">
                  <img src={userPhoto} alt="You" className="sg-split-img" />
                  <span className="sg-split-badge">You</span>
                </div>

                {/* Divider glow */}
                <div className="sg-split-divider">
                  <span className="sg-split-arrow">→</span>
                </div>

                {/* Right — face-swapped scenario or loading */}
                <div className="sg-split-ai">
                  {isLoading && (
                    <div style={{
                      position: "absolute",
                      inset: 0,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      background: "rgba(0,0,0,0.3)",
                      borderRadius: 8,
                    }}>
                      <div style={{
                        width: 24,
                        height: 24,
                        borderRadius: "50%",
                        border: "2px solid rgba(124, 58, 237, 0.3)",
                        borderTopColor: "var(--accent, #7c3aed)",
                        animation: "spin 1s linear infinite",
                      }} />
                    </div>
                  )}
                  <img
                    src={displayImageUrl}
                    alt={item.title}
                    className="sg-split-img"
                    style={{ opacity: isLoading ? 0.5 : 1 }}
                  />
                  {item.nsfw && <div className="sg-nsfw-blur"><span className="sg-nsfw-badge">18+</span></div>}
                  <span className="sg-split-badge sg-split-badge-ai">
                    {swapped?.fallback ? "Preview" : "Your AI Twin"}
                  </span>
                </div>
              </div>

              {/* Label */}
              <div className="sg-foot">
                <span className="sg-foot-label">{item.title}</span>
              </div>
            </motion.div>
          );
        })}
      </div>

      <div style={{ textAlign: "center", marginTop: 48 }}>
        <p style={{ fontSize: "1.1rem", fontWeight: 600, marginBottom: 8 }}>
          Ready to see these with your face?
        </p>
        <p className="muted" style={{ marginBottom: 24 }}>
          Subscribe and your first real batch is delivered within 24 hours.
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
