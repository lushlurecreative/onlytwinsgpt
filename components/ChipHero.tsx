"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import PremiumButton from "@/components/PremiumButton";

type Props = {
  uploadedPhotos: string[];
};

export default function ChipHero({ uploadedPhotos }: Props) {
  const [chipPulsed, setChipPulsed] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setChipPulsed(true), 1100);
    return () => clearTimeout(t);
  }, []);

  return (
    <section className="chip-hero">
      {/* Left: text */}
      <div className="chip-hero-text">
        <p className="eyebrow">Your face. Powered by AI.</p>
        <h1 className="chip-hero-headline">
          20+ scenarios.<br />
          <span style={{ color: "var(--accent)" }}>One subscription.</span>
        </h1>
        <p className="chip-hero-sub">
          We train a custom AI model on your photos and generate ready-to-post content for your
          social channels every single month.
        </p>

        {/* Uploaded photo row */}
        <div className="chip-photo-row">
          {uploadedPhotos.slice(0, 3).map((src, i) => (
            <div key={i} className="chip-photo-thumb">
              <img src={src} alt={`Your photo ${i + 1}`} />
            </div>
          ))}
          <span className="chip-photo-label">↑ Your photos going in</span>
        </div>

        <div className="cta-row" style={{ marginTop: 24 }}>
          <PremiumButton href="/pricing">Subscribe &amp; Get Started</PremiumButton>
          <PremiumButton href="/gallery" variant="secondary">See All Scenarios</PremiumButton>
        </div>
      </div>

      {/* Right: chip graphic */}
      <div className="chip-hero-visual">
        <div className="chip-wrap">
          {/* Floating photo that animates into chip */}
          <motion.div
            className="chip-incoming-photo"
            initial={{ x: -90, y: -70, scale: 0.5, opacity: 0 }}
            animate={{ x: 0, y: 0, scale: 1, opacity: 1 }}
            transition={{ type: "spring", stiffness: 120, damping: 20, delay: 0.3 }}
          >
            <img src={uploadedPhotos[0]} alt="Your photo" />
          </motion.div>

          {/* The chip */}
          <div className={`chip-graphic ${chipPulsed ? "chip-pulsed" : ""}`}>
            {/* Pin rows */}
            <div className="chip-pins chip-pins-top" />
            <div className="chip-pins chip-pins-bottom" />
            <div className="chip-pins chip-pins-left" />
            <div className="chip-pins chip-pins-right" />

            {/* Inner die */}
            <div className="chip-die">
              <div className="chip-die-grid">
                <div className="chip-die-cell" />
                <div className="chip-die-cell" />
                <div className="chip-die-cell chip-die-center">
                  <motion.div
                    className="chip-core-glow"
                    animate={chipPulsed ? { scale: [1, 1.08, 1], opacity: [0.7, 1, 0.7] } : {}}
                    transition={{ duration: 0.6, ease: "easeInOut" }}
                  />
                  {/* OT monogram */}
                  <span className="chip-monogram">OT</span>
                </div>
                <div className="chip-die-cell" />
              </div>
            </div>

            {/* Blue glow pulse ring */}
            <motion.div
              className="chip-pulse-ring"
              animate={chipPulsed ? { scale: [1, 1.4], opacity: [0.6, 0] } : {}}
              transition={{ duration: 0.7, ease: "easeOut" }}
            />
          </div>

          {/* Connection line from photo to chip */}
          <motion.div
            className="chip-connection-line"
            initial={{ scaleX: 0, opacity: 0 }}
            animate={{ scaleX: 1, opacity: 1 }}
            transition={{ delay: 0.9, duration: 0.4 }}
          />
        </div>
      </div>
    </section>
  );
}
