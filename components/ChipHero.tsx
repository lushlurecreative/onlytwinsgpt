"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import PremiumButton from "@/components/PremiumButton";

type Props = { uploadedPhotos: string[] };

// Fine LGA pad grid — 34 pads per row × 2 rows, 8px pitch
const PAD_COUNT = 34;
const PAD_START = 98;
const PAD_PITCH = 8.5;
const H_PADS = Array.from({ length: PAD_COUNT }, (_, i) => PAD_START + i * PAD_PITCH);
const V_PADS = Array.from({ length: PAD_COUNT }, (_, i) => PAD_START + i * PAD_PITCH);

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
          <svg viewBox="0 0 432 432" className="ch-svg" xmlns="http://www.w3.org/2000/svg">
            <defs>
              {/* PCB substrate — dark green like reference */}
              <linearGradient id="pkgGrad" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="#0e2015" />
                <stop offset="45%" stopColor="#081410" />
                <stop offset="100%" stopColor="#040c08" />
              </linearGradient>

              <linearGradient id="pkgEdge" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="rgba(0,255,120,0.10)" />
                <stop offset="60%" stopColor="rgba(0,200,100,0.03)" />
                <stop offset="100%" stopColor="rgba(0,0,0,0)" />
              </linearGradient>

              {/* Substrate inner — slightly lighter green */}
              <linearGradient id="subGrad" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="#0f1f16" />
                <stop offset="100%" stopColor="#060e0a" />
              </linearGradient>

              {/* Die — very dark green-black */}
              <linearGradient id="dieGrad" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="#101810" />
                <stop offset="100%" stopColor="#060a06" />
              </linearGradient>

              {/* LGA pad — gold/copper matching reference */}
              <linearGradient id="padH" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#d4920a" />
                <stop offset="50%" stopColor="#a06800" />
                <stop offset="100%" stopColor="#5a3800" />
              </linearGradient>
              <linearGradient id="padV" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor="#d4920a" />
                <stop offset="50%" stopColor="#a06800" />
                <stop offset="100%" stopColor="#5a3800" />
              </linearGradient>

              {/* Core glow — BLUE/CYAN matching AI chip reference */}
              <radialGradient id="coreGlow" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="#00d4ff" stopOpacity={loaded ? "1" : "0.5"} />
                <stop offset="30%" stopColor="#0080e0" stopOpacity={loaded ? "0.85" : "0.3"} />
                <stop offset="70%" stopColor="#0040a0" stopOpacity={loaded ? "0.4" : "0.1"} />
                <stop offset="100%" stopColor="#001040" stopOpacity="0" />
              </radialGradient>

              {/* Outer blue ambient — matches reference's broad blue lighting */}
              <radialGradient id="outerAmbient" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="#0060c0" stopOpacity="0.15" />
                <stop offset="60%" stopColor="#003080" stopOpacity="0.06" />
                <stop offset="100%" stopColor="transparent" />
              </radialGradient>

              {/* Die ambient — blue tint */}
              <radialGradient id="dieAmbient" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="#002060" stopOpacity="0.6" />
                <stop offset="100%" stopColor="transparent" />
              </radialGradient>

              {/* Face clip */}
              <clipPath id="faceClip">
                <circle cx="216" cy="216" r="28" />
              </clipPath>
            </defs>

            {/* ── OUTER BLUE AMBIENT GLOW (matches reference) ── */}
            <ellipse cx="216" cy="216" rx="200" ry="200" fill="url(#outerAmbient)" />
            <ellipse cx="216" cy="216" rx="160" ry="160"
              fill="rgba(0,120,255,0.07)" />

            {/* ── TOP LGA PAD ROWS ── */}
            {H_PADS.map((x, i) => (
              <rect key={`t1${i}`} x={x} y={54} width={4.5} height={7} rx={0.8}
                fill="url(#padH)" className="ch-pin-el" />
            ))}
            {H_PADS.map((x, i) => (
              <rect key={`t2${i}`} x={x} y={63} width={4.5} height={7} rx={0.8}
                fill="url(#padH)" className="ch-pin-el" opacity="0.7" />
            ))}

            {/* ── BOTTOM LGA PAD ROWS ── */}
            {H_PADS.map((x, i) => (
              <rect key={`b1${i}`} x={x} y={362} width={4.5} height={7} rx={0.8}
                fill="url(#padH)" className="ch-pin-el" />
            ))}
            {H_PADS.map((x, i) => (
              <rect key={`b2${i}`} x={x} y={371} width={4.5} height={7} rx={0.8}
                fill="url(#padH)" className="ch-pin-el" opacity="0.7" />
            ))}

            {/* ── LEFT LGA PAD ROWS ── */}
            {V_PADS.map((y, i) => (
              <rect key={`l1${i}`} x={54} y={y} width={7} height={4.5} rx={0.8}
                fill="url(#padV)" className="ch-pin-el" />
            ))}
            {V_PADS.map((y, i) => (
              <rect key={`l2${i}`} x={63} y={y} width={7} height={4.5} rx={0.8}
                fill="url(#padV)" className="ch-pin-el" opacity="0.7" />
            ))}

            {/* ── RIGHT LGA PAD ROWS ── */}
            {V_PADS.map((y, i) => (
              <rect key={`r1${i}`} x={362} y={y} width={7} height={4.5} rx={0.8}
                fill="url(#padV)" className="ch-pin-el" />
            ))}
            {V_PADS.map((y, i) => (
              <rect key={`r2${i}`} x={371} y={y} width={7} height={4.5} rx={0.8}
                fill="url(#padV)" className="ch-pin-el" opacity="0.7" />
            ))}

            {/* ── PACKAGE BODY — green PCB octagonal ── */}
            <polygon
              points="98,72 334,72 360,98 360,334 334,360 98,360 72,334 72,98"
              fill="url(#pkgGrad)"
              stroke="rgba(0,200,80,0.12)"
              strokeWidth="1"
            />
            <polygon
              points="98,72 334,72 360,98 360,334 334,360 98,360 72,334 72,98"
              fill="url(#pkgEdge)"
              opacity="0.6"
            />

            {/* Mounting holes / corner marks */}
            <circle cx="110" cy="110" r="5.5" fill="#020a04" stroke="rgba(0,200,80,0.2)" strokeWidth="0.8" />
            <circle cx="322" cy="110" r="5.5" fill="#020a04" stroke="rgba(0,200,80,0.2)" strokeWidth="0.8" />
            <circle cx="322" cy="322" r="5.5" fill="#020a04" stroke="rgba(0,200,80,0.2)" strokeWidth="0.8" />
            <circle cx="110" cy="322" r="5.5" fill="#020a04" stroke="rgba(0,200,80,0.2)" strokeWidth="0.8" />

            {/* ── SUBSTRATE ── */}
            <rect x="108" y="108" width="216" height="216" rx="5"
              fill="url(#subGrad)"
              stroke="rgba(0,180,60,0.2)" strokeWidth="0.8" />

            {/* Substrate circuit traces — gold on green PCB */}
            <g stroke="rgba(180,130,20,0.18)" strokeWidth="0.6" fill="none">
              {Array.from({ length: 10 }, (_, i) => (
                <line key={`sh${i}`} x1={108} y1={126 + i * 22} x2={324} y2={126 + i * 22} />
              ))}
              {Array.from({ length: 10 }, (_, i) => (
                <line key={`sv${i}`} x1={126 + i * 22} y1={108} x2={126 + i * 22} y2={324} />
              ))}
            </g>
            {/* Additional diagonal accent traces */}
            <g stroke="rgba(0,180,60,0.10)" strokeWidth="0.5" fill="none">
              <line x1="108" y1="108" x2="165" y2="165" />
              <line x1="324" y1="108" x2="267" y2="165" />
              <line x1="108" y1="324" x2="165" y2="267" />
              <line x1="324" y1="324" x2="267" y2="267" />
            </g>

            {/* ── DIE ACTIVE AREA ── */}
            <rect x="140" y="140" width="152" height="152" rx="4"
              fill="url(#dieGrad)"
              stroke="rgba(0,160,255,0.35)" strokeWidth="1.2" />

            {/* Die cross dividers */}
            <line x1="216" y1="140" x2="216" y2="292"
              stroke="rgba(0,160,255,0.22)" strokeWidth="0.8" />
            <line x1="140" y1="216" x2="292" y2="216"
              stroke="rgba(0,160,255,0.22)" strokeWidth="0.8" />

            {/* Quadrant tints */}
            <rect x="141" y="141" width="74" height="74" fill="rgba(0,100,255,0.05)" />
            <rect x="217" y="141" width="74" height="74" fill="rgba(0,80,200,0.03)" />
            <rect x="141" y="217" width="74" height="74" fill="rgba(0,80,200,0.03)" />
            <rect x="217" y="217" width="74" height="74" fill="rgba(0,100,255,0.05)" />

            {/* Fine die traces — blue like reference */}
            <g stroke="rgba(0,200,255,0.18)" strokeWidth="0.7" fill="none">
              <line x1="216" y1="140" x2="216" y2="178" />
              <line x1="216" y1="254" x2="216" y2="292" />
              <line x1="140" y1="216" x2="178" y2="216" />
              <line x1="254" y1="216" x2="292" y2="216" />
              {/* Extra accent lines */}
              <line x1="178" y1="178" x2="192" y2="192" />
              <line x1="254" y1="178" x2="240" y2="192" />
              <line x1="178" y1="254" x2="192" y2="240" />
              <line x1="254" y1="254" x2="240" y2="240" />
            </g>

            {/* ── CORE — blue/cyan glow, centred ── */}
            {/* Broad glow spread */}
            <rect x="156" y="156" width="120" height="120" rx="10"
              fill="url(#coreGlow)" opacity="0.9" />
            {/* Tighter inner glow */}
            <rect x="183" y="183" width="66" height="66" rx="6"
              fill="rgba(0,150,255,0.35)" opacity={loaded ? 1 : 0.3}
              style={{ transition: "opacity 0.5s" }} />
            {/* Core dark box */}
            <rect x="192" y="192" width="48" height="48" rx="4"
              fill="#020408"
              stroke="rgba(0,180,255,0.7)" strokeWidth="1.5"
              style={{ transition: "stroke-opacity 0.5s" }} />
            {/* Die ambient */}
            <rect x="140" y="140" width="152" height="152" rx="4"
              fill="url(#dieAmbient)" opacity="0.4" />

            {/* ── USER FACE — centred on core ── */}
            <image
              href={userPhoto}
              x={188} y={188}
              width={56} height={56}
              clipPath="url(#faceClip)"
              preserveAspectRatio="xMidYMid slice"
              style={{ filter: "brightness(1.1) contrast(1.05) saturate(0.9)" }}
            />
            {/* Face ring — cyan/blue */}
            <circle cx="216" cy="216" r="28"
              fill="none"
              stroke={loaded ? "#00d4ff" : "rgba(0,160,255,0.5)"}
              strokeWidth="1.8"
              style={{ transition: "stroke 0.5s" }}
            />
            {/* Second outer ring */}
            {loaded && (
              <circle cx="216" cy="216" r="34"
                fill="none"
                stroke="rgba(0,200,255,0.2)"
                strokeWidth="0.8"
              />
            )}

            {/* ── PULSE RING on load ── */}
            {loaded && (
              <motion.circle
                cx="216" cy="216" r="44"
                fill="none"
                stroke="rgba(0,180,255,0.6)"
                strokeWidth="2"
                initial={{ r: 44, opacity: 0.9 }}
                animate={{ r: 190, opacity: 0 }}
                transition={{ duration: 1.4, ease: "easeOut" }}
              />
            )}
          </svg>
        </div>
      </div>
    </section>
  );
}
