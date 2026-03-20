"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { useEffect, useState, useCallback, useRef } from "react";
import { galleryItems } from "@/lib/gallery-data";

type Props = { uploadedPhotos: string[] };

const sceneItems = galleryItems.filter((i) => i.type === "image").slice(0, 5);

type SwappedImage = {
  url: string;
  loading: boolean;
};

type QueuedRequest = {
  index: number;
  scenarioUrl: string;
};

export default function ScenarioGrid({ uploadedPhotos }: Props) {
  const userPhoto = uploadedPhotos[0];
  const [swappedImages, setSwappedImages] = useState<Record<number, SwappedImage>>({});
  const [userPhotoUrl, setUserPhotoUrl] = useState<string>("");
  const queueRef = useRef<QueuedRequest[]>([]);
  const activeCountRef = useRef(0);
  const MAX_CONCURRENT = 3; // Limit to 3 concurrent requests

  // Store the user photo URL for face swap API calls
  useEffect(() => {
    if (userPhoto) {
      setUserPhotoUrl(userPhoto);
    }
  }, [userPhoto]);

  // Process the queue
  const processQueue = useCallback(async () => {
    while (activeCountRef.current < MAX_CONCURRENT && queueRef.current.length > 0) {
      const request = queueRef.current.shift();
      if (!request) break;

      activeCountRef.current++;
      const { index, scenarioUrl } = request;

      // Set loading state
      setSwappedImages((prev) => ({
        ...prev,
        [index]: { url: "", loading: true },
      }));

      try {
        const response = await fetch("/api/preview/faceswap", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            userPhotoUrl,
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
            },
          }));
        } else {
          setSwappedImages((prev) => ({
            ...prev,
            [index]: { url: scenarioUrl, loading: false },
          }));
        }
      } catch (error) {
        console.error(`Face swap error for scenario ${index}:`, error);
        setSwappedImages((prev) => ({
          ...prev,
          [index]: { url: scenarioUrl, loading: false },
        }));
      } finally {
        activeCountRef.current--;
        // Continue processing queue
        processQueue();
      }
    }
  }, [userPhotoUrl]);

  // Perform face swaps for visible scenarios - uses queue
  const performFaceSwap = useCallback(
    (index: number, scenarioUrl: string) => {
      if (!userPhotoUrl || swappedImages[index]?.url) return;

      // Add to queue if not already queued
      if (!queueRef.current.some((r) => r.index === index)) {
        queueRef.current.push({ index, scenarioUrl });
      }

      // Start processing queue
      processQueue();
    },
    [userPhotoUrl, swappedImages, processQueue]
  );

  return (
    <section className="sg-section">
      <div className="sg-header">
        <h2 className="sg-title">20+ scenarios. Your face in all of them.</h2>
        <p className="sg-sub">
          Here's your face in our content. Subscribe to get 20+ new scenarios every month.
        </p>
      </div>

      <div className="sg-grid">
        {sceneItems.map((item, i) => {
          const swapped = swappedImages[i];
          const displayImageUrl = swapped?.url;
          const isLoading = swapped?.loading;

          // Trigger face swap when item is about to be visible
          const onViewportEnter = () => {
            if (userPhotoUrl && !swappedImages[i]) {
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
              {/* Face-swapped image only - no split view */}
              <div style={{ position: "relative", width: "100%", height: "100%", overflow: "hidden", borderRadius: 8 }}>
                {isLoading ? (
                  <div style={{
                    width: "100%",
                    height: 200,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    background: "rgba(0,0,0,0.3)",
                    borderRadius: 8,
                  }}>
                    <div style={{
                      width: 32,
                      height: 32,
                      borderRadius: "50%",
                      border: "3px solid rgba(124, 58, 237, 0.3)",
                      borderTopColor: "var(--accent, #7c3aed)",
                      animation: "spin 1s linear infinite",
                    }} />
                  </div>
                ) : displayImageUrl ? (
                  <>
                    <img
                      src={displayImageUrl}
                      alt={item.title}
                      style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                    />
                    {item.nsfw && (
                      <div style={{
                        position: "absolute",
                        inset: 0,
                        background: "rgba(0,0,0,0.5)",
                        backdropFilter: "blur(8px)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                      }}>
                        <span style={{
                          background: "rgba(0,0,0,0.8)",
                          color: "#fff",
                          padding: "8px 12px",
                          borderRadius: 4,
                          fontSize: 12,
                          fontWeight: 700,
                          letterSpacing: "0.06em",
                        }}>18+</span>
                      </div>
                    )}
                  </>
                ) : null}
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
          Ready for your real AI twin?
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
