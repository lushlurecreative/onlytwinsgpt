"use client";

import { motion } from "framer-motion";
import { galleryItems } from "@/lib/gallery-data";

type Props = {
  uploadedPhotos: string[];
};

const gridItems = galleryItems.filter((i) => i.type === "image").slice(0, 24);

export default function ScenarioGrid({ uploadedPhotos }: Props) {
  const userPhoto = uploadedPhotos[0] ?? null;

  return (
    <section className="sg-section">
      <div className="sg-header">
        <h2 className="sg-title">Your twin in every scenario</h2>
        <p className="sg-sub">
          Your face, dropped into 20+ AI worlds. Subscribe and your actual results are trained
          on your exact photos.
        </p>
      </div>

      <div className="sg-grid">
        {gridItems.map((item, i) => (
          <motion.div
            key={i}
            className={`sg-card ${item.nsfw ? "sg-card-nsfw" : ""}`}
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-40px" }}
            transition={{ duration: 0.45, delay: (i % 4) * 0.07 }}
          >
            {/* Scenario image */}
            <div className="sg-img-wrap">
              <img src={item.src} alt={item.title} className="sg-img" />

              {/* User face — blended as overlay */}
              {userPhoto && (
                <div className="sg-face-overlay">
                  <img src={userPhoto} alt="Your face" className="sg-face-img" />
                </div>
              )}

              {/* NSFW blur */}
              {item.nsfw && (
                <div className="sg-nsfw-blur">
                  <span className="sg-nsfw-badge">18+</span>
                </div>
              )}
            </div>

            {/* Card footer */}
            <div className="sg-foot">
              <div className="sg-foot-left">
                {userPhoto ? (
                  <img src={userPhoto} alt="You" className="sg-foot-face" />
                ) : (
                  <div className="sg-foot-placeholder">You</div>
                )}
                <span className="sg-foot-arrow">→</span>
              </div>
              <span className="sg-foot-label">{item.title}</span>
            </div>
          </motion.div>
        ))}
      </div>
    </section>
  );
}
