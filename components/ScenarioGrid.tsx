"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { galleryItems } from "@/lib/gallery-data";

type Props = { uploadedPhotos: string[] };

const sceneItems = galleryItems.filter((i) => i.type === "image").slice(0, 20);

export default function ScenarioGrid({ uploadedPhotos }: Props) {

  return (
    <section className="sg-section">
      <div className="sg-header">
        <h2 className="sg-title">20+ scenarios. Your face in all of them.</h2>
        <p className="sg-sub">
          Here's your face in our content. Subscribe to get 20+ new scenarios every month.
        </p>
      </div>

      <div className="sg-grid">
        {sceneItems.map((item, i) => (
          <motion.div
            key={i}
            className={`sg-card${item.nsfw ? " sg-card-nsfw" : ""}`}
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-30px" }}
            transition={{ duration: 0.4, delay: (i % 4) * 0.06 }}
          >
            <div style={{ position: "relative", width: "100%", height: "100%", overflow: "hidden", borderRadius: 8 }}>
              <img
                src={item.src}
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
            </div>

            <div className="sg-foot">
              <span className="sg-foot-label">{item.title}</span>
            </div>
          </motion.div>
        ))}
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
