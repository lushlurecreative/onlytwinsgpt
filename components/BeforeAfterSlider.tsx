"use client";

/* eslint-disable @next/next/no-img-element */

import { useId, useRef, useState } from "react";

type BeforeAfterSliderProps = {
  beforeSrc: string;
  afterSrc: string;
  beforeLabel?: string;
  afterLabel?: string;
};

export default function BeforeAfterSlider({
  beforeSrc,
  afterSrc,
  beforeLabel = "Before",
  afterLabel = "After",
}: BeforeAfterSliderProps) {
  const [position, setPosition] = useState(50);
  const frameRef = useRef<HTMLDivElement | null>(null);
  const sliderId = useId();

  const updateFromClientX = (clientX: number) => {
    const frame = frameRef.current;
    if (!frame) return;
    const rect = frame.getBoundingClientRect();
    if (!rect.width) return;
    const raw = ((clientX - rect.left) / rect.width) * 100;
    const clamped = Math.max(5, Math.min(95, raw));
    setPosition(clamped);
  };

  return (
    <div className="ba-root">
      <div
        ref={frameRef}
        className="ba-frame"
        onPointerDown={(event) => {
          (event.currentTarget as HTMLDivElement).setPointerCapture(event.pointerId);
          updateFromClientX(event.clientX);
        }}
        onPointerMove={(event) => {
          if (event.buttons !== 1) return;
          updateFromClientX(event.clientX);
        }}
      >
        <img src={beforeSrc} alt={beforeLabel} className="ba-image" />
        <div className="ba-after-layer" style={{ clipPath: `inset(0 0 0 ${position}%)` }}>
          <img src={afterSrc} alt={afterLabel} className="ba-image" />
        </div>
        <div className="ba-handle" style={{ left: `${position}%` }}>
          <span className="ba-handle-dot" />
        </div>
        <span className="ba-pill ba-pill-left">{beforeLabel}</span>
        <span className="ba-pill ba-pill-right">{afterLabel}</span>
      </div>

      <label htmlFor={sliderId} className="ba-label">
        Drag to compare
      </label>
      <input
        id={sliderId}
        type="range"
        min={5}
        max={95}
        value={position}
        className="ba-range"
        onChange={(event) => setPosition(Number(event.target.value))}
      />
    </div>
  );
}
