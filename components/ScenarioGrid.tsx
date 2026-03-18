"use client";

import { motion } from "framer-motion";
import { galleryItems } from "@/lib/gallery-data";

type Props = { uploadedPhotos: string[] };

const sceneItems = galleryItems.filter((i) => i.type === "image").slice(0, 20);

export default function ScenarioGrid({ uploadedPhotos }: Props) {
  const userPhoto = uploadedPhotos[0];

  return (
    <section className="sg-section">
      <div className="sg-header">
        <h2 className="sg-title">Your face. Every scenario.</h2>
        <p className="sg-sub">
          Your AI twin placed into 20+ worlds. This is what gets delivered to your vault every month.
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
            {/* Before/after split: user photo → AI scene */}
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

              {/* Right — AI scenario */}
              <div className="sg-split-ai">
                <img src={item.src} alt={item.title} className="sg-split-img" />
                {item.nsfw && <div className="sg-nsfw-blur"><span className="sg-nsfw-badge">18+</span></div>}
                <span className="sg-split-badge sg-split-badge-ai">AI Twin</span>
              </div>
            </div>

            {/* Label */}
            <div className="sg-foot">
              <span className="sg-foot-label">{item.title}</span>
            </div>
          </motion.div>
        ))}
      </div>
    </section>
  );
}
