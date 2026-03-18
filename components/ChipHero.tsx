"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import PremiumButton from "@/components/PremiumButton";

type Props = {
  uploadedPhotos: string[];
};

const PINS = Array.from({ length: 8 });

export default function ChipHero({ uploadedPhotos }: Props) {
  const [chipLoaded, setChipLoaded] = useState(false);

  useEffect(() => {
    // Fire 1400ms after mount — after the spring animation has landed (~1.2s)
    const t = setTimeout(() => setChipLoaded(true), 1400);
    return () => clearTimeout(t);
  }, []);

  return (
    <section className="ch-section">
      {/* Left */}
      <div className="ch-text">
        <p className="eyebrow">Your face. Powered by AI.</p>
        <h1 className="ch-headline">
          20+ scenarios.<br />
          <span style={{ color: "var(--accent)" }}>One subscription.</span>
        </h1>
        <p className="ch-sub">
          We train a custom AI model on your photos and generate ready-to-post content
          for your social channels every single month.
        </p>

        <div className="ch-photo-row">
          {uploadedPhotos.slice(0, 3).map((src, i) => (
            <div key={i} className="ch-photo-thumb">
              <img src={src} alt={`Your photo ${i + 1}`} />
            </div>
          ))}
          <span className="ch-photo-label">↑ Your photos going in</span>
        </div>

        <div className="cta-row" style={{ marginTop: 32 }}>
          <PremiumButton href="/pricing">Subscribe &amp; Get Started</PremiumButton>
          <PremiumButton href="/gallery" variant="secondary">See All Scenarios</PremiumButton>
        </div>
      </div>

      {/* Right — chip stage */}
      <div className="ch-visual">
        {/*
          chip-stage: 440×440 relative container.
          chip-body is centred at offset (60,60) — 320×320.
          The photo's natural CSS position is centred in the stage (220,220).
          Framer Motion x/y are offsets from that natural position.
          Initial x:-300 y:-280 puts it at (-80,-60) — off-screen top-left.
          Final x:0 y:0 puts it at stage centre = chip die centre. ✓
        */}
        <div className="ch-stage">

          {/* Pin strips — OUTSIDE chip-body, no clip-path affecting them */}
          <div className="ch-pins ch-pins-top">
            {PINS.map((_, i) => <span key={i} className={`ch-pin ${chipLoaded ? "ch-pin-lit" : ""}`} style={{ animationDelay: `${i * 0.06}s` }} />)}
          </div>
          <div className="ch-pins ch-pins-bottom">
            {PINS.map((_, i) => <span key={i} className={`ch-pin ${chipLoaded ? "ch-pin-lit" : ""}`} style={{ animationDelay: `${i * 0.06}s` }} />)}
          </div>
          <div className="ch-pins ch-pins-left">
            {PINS.map((_, i) => <span key={i} className={`ch-pin ch-pin-v ${chipLoaded ? "ch-pin-lit" : ""}`} style={{ animationDelay: `${i * 0.06}s` }} />)}
          </div>
          <div className="ch-pins ch-pins-right">
            {PINS.map((_, i) => <span key={i} className={`ch-pin ch-pin-v ${chipLoaded ? "ch-pin-lit" : ""}`} style={{ animationDelay: `${i * 0.06}s` }} />)}
          </div>

          {/* Chip body — clip-path only affects this element and its children */}
          <div className={`ch-body ${chipLoaded ? "ch-body-lit" : ""}`}>
            <div className="ch-surface" />

            {/* Die area */}
            <div className="ch-die">
              <div className="ch-die-trace-h" />
              <div className="ch-die-trace-v" />
              <div className={`ch-die-core ${chipLoaded ? "ch-die-core-lit" : ""}`}>
                <div className="ch-die-core-glow" />
                <span className="ch-monogram">OT</span>
              </div>
            </div>
          </div>

          {/* Pulse ring — expands when chip loads */}
          <motion.div
            className="ch-pulse-ring"
            animate={chipLoaded ? { scale: [0.3, 2.2], opacity: [0.8, 0] } : { scale: 0.3, opacity: 0 }}
            transition={{ duration: 0.9, ease: "easeOut" }}
          />

          {/* The user's photo — flies from outside into chip centre */}
          <motion.div
            className="ch-photo"
            initial={{ x: -300, y: -280, scale: 1.2, opacity: 0 }}
            animate={
              chipLoaded
                ? { x: 0, y: 0, scale: 1, opacity: 0 }  // absorbed into chip
                : { x: 0, y: 0, scale: 1, opacity: 1 }  // lands at centre
            }
            transition={
              chipLoaded
                ? { duration: 0.35, ease: "easeIn" }
                : { type: "spring", stiffness: 75, damping: 16, delay: 0.4 }
            }
          >
            <img src={uploadedPhotos[0]} alt="Your photo" />
          </motion.div>

          {/* Connection trace — SVG line from start position to chip */}
          <motion.svg
            className="ch-trace-svg"
            viewBox="0 0 440 440"
            initial={{ opacity: 0 }}
            animate={{ opacity: chipLoaded ? 0 : 1 }}
            transition={{ delay: 0.5, duration: 0.4 }}
          >
            <motion.path
              d="M 50 50 Q 120 130 220 220"
              stroke="rgba(0,174,239,0.4)"
              strokeWidth="1.5"
              fill="none"
              strokeDasharray="1"
              initial={{ pathLength: 0 }}
              animate={{ pathLength: chipLoaded ? 0 : 1 }}
              transition={{ delay: 0.6, duration: 0.7, ease: "easeOut" }}
            />
          </motion.svg>

        </div>
      </div>
    </section>
  );
}
