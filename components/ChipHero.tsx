"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import PremiumButton from "@/components/PremiumButton";

type Props = { uploadedPhotos: string[] };

const PIN_COUNT = 10;
const PIN_START = 82;
const PIN_STEP = 28;
const pins = Array.from({ length: PIN_COUNT }, (_, i) => PIN_START + i * PIN_STEP);

export default function ChipHero({ uploadedPhotos }: Props) {
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setLoaded(true), 1500);
    return () => clearTimeout(t);
  }, []);

  return (
    <section className="ch-section">
      {/* Left text */}
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

      {/* Right — chip */}
      <div className="ch-visual">
        <div className="ch-stage">

          {/* SVG chip — all graphics in viewBox 0 0 440 440 */}
          <svg
            viewBox="0 0 440 440"
            className={`ch-svg${loaded ? " ch-svg-lit" : ""}`}
            xmlns="http://www.w3.org/2000/svg"
          >
            <defs>
              <linearGradient id="chPkgGrad" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="#27273a" />
                <stop offset="100%" stopColor="#131320" />
              </linearGradient>
              <linearGradient id="chPinVGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#e8a060" />
                <stop offset="55%" stopColor="#b87333" />
                <stop offset="100%" stopColor="#6b3c0f" />
              </linearGradient>
              <linearGradient id="chPinHGrad" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor="#e8a060" />
                <stop offset="55%" stopColor="#b87333" />
                <stop offset="100%" stopColor="#6b3c0f" />
              </linearGradient>
              <linearGradient id="chDieGrad" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="#1c2035" />
                <stop offset="100%" stopColor="#12121e" />
              </linearGradient>
              <radialGradient id="chCoreGrad" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="#ff8c00" stopOpacity="0.95" />
                <stop offset="45%" stopColor="#cc4400" stopOpacity="0.55" />
                <stop offset="100%" stopColor="transparent" />
              </radialGradient>
              <radialGradient id="chCoreLoadedGrad" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="#00aeef" stopOpacity="1" />
                <stop offset="50%" stopColor="#0066aa" stopOpacity="0.6" />
                <stop offset="100%" stopColor="transparent" />
              </radialGradient>
              <radialGradient id="chAmbient" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="rgba(255,120,0,0.18)" />
                <stop offset="100%" stopColor="transparent" />
              </radialGradient>
              <filter id="chPinGlow" x="-50%" y="-50%" width="200%" height="200%">
                <feGaussianBlur stdDeviation="2.5" result="blur" />
                <feMerge>
                  <feMergeNode in="blur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>

            {/* Ambient package glow */}
            <rect x="40" y="40" width="360" height="360" rx="24"
              fill="url(#chAmbient)" className="ch-svg-ambient" />

            {/* ── TOP PINS ── */}
            {pins.map((x, i) => (
              <rect key={`t${i}`} x={x} y={28} width={14} height={26} rx={3}
                fill="url(#chPinVGrad)" className="ch-svg-pin" />
            ))}
            {/* TOP pin traces */}
            {pins.map((x, i) => (
              <line key={`tt${i}`} x1={x + 7} y1={54} x2={x + 7} y2={108}
                stroke="rgba(184,115,51,0.22)" strokeWidth="0.8" />
            ))}

            {/* ── BOTTOM PINS ── */}
            {pins.map((x, i) => (
              <rect key={`b${i}`} x={x} y={386} width={14} height={26} rx={3}
                fill="url(#chPinVGrad)" className="ch-svg-pin" />
            ))}
            {pins.map((x, i) => (
              <line key={`bt${i}`} x1={x + 7} y1={332} x2={x + 7} y2={386}
                stroke="rgba(184,115,51,0.22)" strokeWidth="0.8" />
            ))}

            {/* ── LEFT PINS ── */}
            {pins.map((y, i) => (
              <rect key={`l${i}`} x={28} y={y} width={26} height={14} rx={3}
                fill="url(#chPinHGrad)" className="ch-svg-pin" />
            ))}
            {pins.map((y, i) => (
              <line key={`lt${i}`} x1={54} y1={y + 7} x2={108} y2={y + 7}
                stroke="rgba(184,115,51,0.22)" strokeWidth="0.8" />
            ))}

            {/* ── RIGHT PINS ── */}
            {pins.map((y, i) => (
              <rect key={`r${i}`} x={386} y={y} width={26} height={14} rx={3}
                fill="url(#chPinHGrad)" className="ch-svg-pin" />
            ))}
            {pins.map((y, i) => (
              <line key={`rt${i}`} x1={332} y1={y + 7} x2={386} y2={y + 7}
                stroke="rgba(184,115,51,0.22)" strokeWidth="0.8" />
            ))}

            {/* ── PACKAGE BODY ── */}
            <rect x="54" y="54" width="332" height="332" rx="14"
              fill="url(#chPkgGrad)"
              stroke="rgba(255,255,255,0.09)" strokeWidth="1.5" />
            {/* Inner edge highlight */}
            <rect x="56" y="56" width="328" height="328" rx="12"
              fill="none" stroke="rgba(255,255,255,0.04)" strokeWidth="1" />
            {/* Alignment notch */}
            <circle cx="84" cy="84" r="6" fill="#0d0d17" />

            {/* ── DIE SUBSTRATE ── */}
            <rect x="108" y="108" width="224" height="224" rx="7"
              fill="url(#chDieGrad)"
              stroke="rgba(184,115,51,0.38)" strokeWidth="1" />

            {/* Circuit grid texture on die */}
            <g stroke="rgba(100,130,180,0.1)" strokeWidth="0.5" fill="none">
              {Array.from({ length: 13 }, (_, i) => (
                <line key={`gh${i}`}
                  x1={108} y1={125 + i * 16}
                  x2={332} y2={125 + i * 16} />
              ))}
              {Array.from({ length: 13 }, (_, i) => (
                <line key={`gv${i}`}
                  x1={125 + i * 16} y1={108}
                  x2={125 + i * 16} y2={332} />
              ))}
            </g>

            {/* ── DIE ACTIVE LAYER ── */}
            <rect x="156" y="156" width="128" height="128" rx="6"
              fill="#0d0d1a"
              stroke="rgba(184,115,51,0.45)" strokeWidth="1.2" />
            {/* Active layer traces */}
            <g stroke="rgba(0,174,239,0.18)" strokeWidth="0.8" fill="none">
              <line x1="220" y1="156" x2="220" y2="188" />
              <line x1="220" y1="252" x2="220" y2="284" />
              <line x1="156" y1="220" x2="188" y2="220" />
              <line x1="252" y1="220" x2="284" y2="220" />
              <line x1="176" y1="156" x2="176" y2="176" />  <line x1="264" y1="156" x2="264" y2="176" />
              <line x1="176" y1="264" x2="176" y2="284" />  <line x1="264" y1="264" x2="264" y2="284" />
              <line x1="156" y1="176" x2="176" y2="176" />  <line x1="156" y1="264" x2="176" y2="264" />
              <line x1="264" y1="176" x2="284" y2="176" />  <line x1="264" y1="264" x2="284" y2="264" />
              {/* Corner dots */}
              <circle cx="176" cy="176" r="2.5" fill="rgba(0,174,239,0.3)" />
              <circle cx="264" cy="176" r="2.5" fill="rgba(0,174,239,0.3)" />
              <circle cx="176" cy="264" r="2.5" fill="rgba(0,174,239,0.3)" />
              <circle cx="264" cy="264" r="2.5" fill="rgba(0,174,239,0.3)" />
            </g>

            {/* ── DIE CORE ── */}
            <rect x="190" y="190" width="60" height="60" rx="8"
              fill="#060610"
              stroke="rgba(184,115,51,0.55)" strokeWidth="1.5"
              className="ch-svg-core-border" />
            <rect x="190" y="190" width="60" height="60" rx="8"
              fill={loaded ? "url(#chCoreLoadedGrad)" : "url(#chCoreGrad)"}
              className="ch-svg-core-fill" />

            {/* OT monogram */}
            <text x="220" y="221" textAnchor="middle" dominantBaseline="middle"
              fontSize="14" fontWeight="800" fontFamily="Inter, ui-sans-serif, sans-serif"
              className="ch-svg-ot">OT</text>

            {/* Pulse ring — fires on load */}
            {loaded && (
              <motion.circle
                cx="220" cy="220" r="36"
                fill="none"
                stroke="#00aeef"
                strokeWidth="2"
                initial={{ r: 36, opacity: 0.9 }}
                animate={{ r: 160, opacity: 0 }}
                transition={{ duration: 1.1, ease: "easeOut" }}
              />
            )}
          </svg>

          {/* User photo — CSS-centred on stage, Framer Motion offsets it for flight */}
          {/* animate stays at x:0,y:0 always — photo STAYS on chip after landing */}
          <motion.div
            className={`ch-photo${loaded ? " ch-photo-loaded" : ""}`}
            initial={{ x: -200, y: -200, scale: 1.4, opacity: 0 }}
            animate={{ x: 0, y: 0, scale: 1, opacity: 1 }}
            transition={{ type: "spring", stiffness: 65, damping: 14, delay: 0.35 }}
          >
            <img src={uploadedPhotos[0]} alt="Your face" />
          </motion.div>

          {/* SVG trace — vanishes when photo is absorbed */}
          <motion.svg
            className="ch-trace-svg"
            viewBox="0 0 440 440"
            initial={{ opacity: 0 }}
            animate={{ opacity: loaded ? 0 : 1 }}
            transition={{ delay: 0.5, duration: 0.5 }}
          >
            <motion.path
              d="M 60 60 C 100 120 160 170 220 220"
              stroke="rgba(0,174,239,0.45)"
              strokeWidth="1.5"
              fill="none"
              strokeDasharray="1"
              initial={{ pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{ delay: 0.6, duration: 0.8, ease: "easeInOut" }}
            />
          </motion.svg>

        </div>
      </div>
    </section>
  );
}
