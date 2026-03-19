"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import PremiumButton from "@/components/PremiumButton";

type Props = { uploadedPhotos: string[] };

// LGA pin grid — dense rows matching reference
const H_PINS = Array.from({ length: 28 }, (_, i) => 104 + i * 11.5);
const V_PINS = Array.from({ length: 28 }, (_, i) => 104 + i * 11.5);

export default function ChipHero({ uploadedPhotos }: Props) {
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setLoaded(true), 1400);
    return () => clearTimeout(t);
  }, []);

  const userPhoto = uploadedPhotos[0];

  return (
    <section className="ch-section">
      <div className="ch-text">
        <p className="eyebrow">Your face. Powered by AI.</p>
        <h1 className="ch-headline">
          20+ scenarios.<br />
          <span style={{ color: "var(--accent)" }}>One subscription.</span>
        </h1>
        <p className="ch-sub">
          We train a custom AI model on your photos and deliver
          ready-to-post content for your social channels every month.
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

      <div className="ch-visual">
        <div className={`ch-stage${loaded ? " ch-stage-lit" : ""}`}>
          <svg viewBox="0 0 430 430" className="ch-svg" xmlns="http://www.w3.org/2000/svg">
            <defs>
              {/* Package body gradient — dark gunmetal */}
              <linearGradient id="pkgGrad" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="#2e2e38" />
                <stop offset="35%" stopColor="#1e1e26" />
                <stop offset="100%" stopColor="#0e0e14" />
              </linearGradient>

              {/* Package top-left edge catchlight */}
              <linearGradient id="pkgEdge" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="rgba(255,255,255,0.18)" />
                <stop offset="100%" stopColor="rgba(255,255,255,0)" />
              </linearGradient>

              {/* Substrate gradient */}
              <linearGradient id="subGrad" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="#26263a" />
                <stop offset="100%" stopColor="#14141e" />
              </linearGradient>

              {/* Die gradient */}
              <linearGradient id="dieGrad" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="#1a1a28" />
                <stop offset="100%" stopColor="#0d0d16" />
              </linearGradient>

              {/* Pin gradient — copper/gold */}
              <linearGradient id="pinHGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#d4860a" />
                <stop offset="50%" stopColor="#b36a00" />
                <stop offset="100%" stopColor="#7a4200" />
              </linearGradient>
              <linearGradient id="pinVGrad" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor="#d4860a" />
                <stop offset="50%" stopColor="#b36a00" />
                <stop offset="100%" stopColor="#7a4200" />
              </linearGradient>

              {/* Core glow — warm amber/orange like reference */}
              <radialGradient id="coreGlow" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="#ff9a20" stopOpacity={loaded ? "1" : "0.7"} />
                <stop offset="40%" stopColor="#cc5500" stopOpacity={loaded ? "0.85" : "0.4"} />
                <stop offset="100%" stopColor="#661a00" stopOpacity="0" />
              </radialGradient>

              {/* Ambient inner die glow */}
              <radialGradient id="dieAmbient" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="#3a1800" stopOpacity="0.8" />
                <stop offset="100%" stopColor="transparent" />
              </radialGradient>

              {/* Face clip circle */}
              <clipPath id="faceClip">
                <circle cx="215" cy="215" r="26" />
              </clipPath>

              {/* Pin glow filter */}
              <filter id="pinGlowFilter" x="-30%" y="-30%" width="160%" height="160%">
                <feGaussianBlur stdDeviation="1.5" result="blur" />
                <feMerge>
                  <feMergeNode in="blur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>

              {/* Package glow filter */}
              <filter id="pkgGlow" x="-10%" y="-10%" width="120%" height="120%">
                <feGaussianBlur stdDeviation="8" result="blur" />
                <feMerge>
                  <feMergeNode in="blur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>

            {/* ── OUTER AMBIENT GLOW ── */}
            <ellipse cx="215" cy="215" rx="160" ry="160"
              fill="rgba(180,80,0,0.07)" />

            {/* ── TOP PIN ROWS (2 rows, dense grid) ── */}
            {H_PINS.map((x, i) => (
              <rect key={`t1${i}`} x={x} y={58} width={8} height={12} rx={1.5}
                fill="url(#pinHGrad)" className="ch-pin-el" />
            ))}
            {H_PINS.map((x, i) => (
              <rect key={`t2${i}`} x={x} y={72} width={8} height={12} rx={1.5}
                fill="url(#pinHGrad)" className="ch-pin-el" />
            ))}

            {/* ── BOTTOM PIN ROWS ── */}
            {H_PINS.map((x, i) => (
              <rect key={`b1${i}`} x={x} y={346} width={8} height={12} rx={1.5}
                fill="url(#pinHGrad)" className="ch-pin-el" />
            ))}
            {H_PINS.map((x, i) => (
              <rect key={`b2${i}`} x={x} y={360} width={8} height={12} rx={1.5}
                fill="url(#pinHGrad)" className="ch-pin-el" />
            ))}

            {/* ── LEFT PIN ROWS ── */}
            {V_PINS.map((y, i) => (
              <rect key={`l1${i}`} x={58} y={y} width={12} height={8} rx={1.5}
                fill="url(#pinVGrad)" className="ch-pin-el" />
            ))}
            {V_PINS.map((y, i) => (
              <rect key={`l2${i}`} x={72} y={y} width={12} height={8} rx={1.5}
                fill="url(#pinVGrad)" className="ch-pin-el" />
            ))}

            {/* ── RIGHT PIN ROWS ── */}
            {V_PINS.map((y, i) => (
              <rect key={`r1${i}`} x={346} y={y} width={12} height={8} rx={1.5}
                fill="url(#pinVGrad)" className="ch-pin-el" />
            ))}
            {V_PINS.map((y, i) => (
              <rect key={`r2${i}`} x={360} y={y} width={12} height={8} rx={1.5}
                fill="url(#pinVGrad)" className="ch-pin-el" />
            ))}

            {/* ── PACKAGE BODY — octagonal chamfered corners ── */}
            <polygon
              points="104,86 326,86 344,104 344,326 326,344 104,344 86,326 86,104"
              fill="url(#pkgGrad)"
              stroke="rgba(255,255,255,0.12)"
              strokeWidth="1"
            />
            {/* Edge catchlight (top-left bevel) */}
            <polygon
              points="104,86 326,86 344,104 344,326 326,344 104,344 86,326 86,104"
              fill="url(#pkgEdge)"
              opacity="0.6"
            />
            {/* Corner screws */}
            <circle cx="114" cy="114" r="5" fill="#111118" stroke="rgba(255,255,255,0.15)" strokeWidth="0.8" />
            <circle cx="316" cy="114" r="5" fill="#111118" stroke="rgba(255,255,255,0.15)" strokeWidth="0.8" />
            <circle cx="316" cy="316" r="5" fill="#111118" stroke="rgba(255,255,255,0.15)" strokeWidth="0.8" />
            <circle cx="114" cy="316" r="5" fill="#111118" stroke="rgba(255,255,255,0.15)" strokeWidth="0.8" />

            {/* ── SUBSTRATE LAYER ── */}
            <rect x="108" y="108" width="214" height="214" rx="6"
              fill="url(#subGrad)"
              stroke="rgba(180,100,0,0.35)" strokeWidth="1" />

            {/* Substrate circuit traces */}
            <g stroke="rgba(180,100,20,0.15)" strokeWidth="0.6" fill="none">
              {Array.from({ length: 8 }, (_, i) => (
                <line key={`sh${i}`} x1={108} y1={124 + i * 28} x2={322} y2={124 + i * 28} />
              ))}
              {Array.from({ length: 8 }, (_, i) => (
                <line key={`sv${i}`} x1={124 + i * 28} y1={108} x2={124 + i * 28} y2={322} />
              ))}
            </g>

            {/* ── DIE ACTIVE LAYER ── */}
            <rect x="138" y="138" width="154" height="154" rx="4"
              fill="url(#dieGrad)"
              stroke="rgba(200,120,0,0.4)" strokeWidth="1.2" />

            {/* Die quadrant dividers — cross lines like reference */}
            <line x1="215" y1="138" x2="215" y2="292"
              stroke="rgba(200,120,0,0.3)" strokeWidth="1" />
            <line x1="138" y1="215" x2="292" y2="215"
              stroke="rgba(200,120,0,0.3)" strokeWidth="1" />

            {/* Quadrant cells with subtle fill variation */}
            <rect x="139" y="139" width="75" height="75"
              fill="rgba(255,100,0,0.04)" />
            <rect x="216" y="139" width="75" height="75"
              fill="rgba(255,80,0,0.02)" />
            <rect x="139" y="216" width="75" height="75"
              fill="rgba(255,80,0,0.02)" />
            <rect x="216" y="216" width="75" height="75"
              fill="rgba(255,100,0,0.04)" />

            {/* Blue circuit accent lines */}
            <g stroke="rgba(0,174,239,0.15)" strokeWidth="0.7" fill="none">
              <line x1="215" y1="138" x2="215" y2="175" />
              <line x1="215" y1="255" x2="215" y2="292" />
              <line x1="138" y1="215" x2="175" y2="215" />
              <line x1="255" y1="215" x2="292" y2="215" />
            </g>

            {/* ── CORE AREA — warm amber glow ── */}
            <rect x="189" y="189" width="52" height="52" rx="4"
              fill="#060610"
              stroke="rgba(200,100,0,0.6)" strokeWidth="1.5" />
            {/* Core ambient glow spreading outward */}
            <rect x="169" y="169" width="92" height="92" rx="8"
              fill="url(#coreGlow)" opacity="0.8" />
            {/* Die inner glow */}
            <rect x="138" y="138" width="154" height="154" rx="4"
              fill="url(#dieAmbient)" opacity="0.5" />

            {/* ── USER FACE — centred on core ── */}
            <image
              href={userPhoto}
              x={189} y={189}
              width={52} height={52}
              clipPath="url(#faceClip)"
              preserveAspectRatio="xMidYMid slice"
              style={{ filter: "brightness(1.1) contrast(1.05)" }}
            />
            {/* Face ring */}
            <circle cx="215" cy="215" r="26"
              fill="none"
              stroke={loaded ? "#00aeef" : "rgba(255,150,0,0.6)"}
              strokeWidth="1.5"
              style={{ transition: "stroke 0.5s" }}
            />

            {/* ── PULSE RING on load ── */}
            {loaded && (
              <motion.circle
                cx="215" cy="215" r="40"
                fill="none"
                stroke="rgba(255,140,0,0.6)"
                strokeWidth="2"
                initial={{ r: 40, opacity: 0.8 }}
                animate={{ r: 180, opacity: 0 }}
                transition={{ duration: 1.2, ease: "easeOut" }}
              />
            )}
          </svg>
        </div>
      </div>
    </section>
  );
}
