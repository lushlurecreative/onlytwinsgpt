"use client";

/* eslint-disable @next/next/no-img-element */

import { useId, useState } from "react";

type BeforeAfterSliderProps = {
  beforeSrc: string;
  afterSrc: string;
  beforeLabel?: string;
  afterLabel?: string;
};

export default function BeforeAfterSlider({
  beforeSrc,
  afterSrc,
  beforeLabel = "User Upload",
  afterLabel = "AI Result",
}: BeforeAfterSliderProps) {
  const [position, setPosition] = useState(52);
  const sliderId = useId();

  return (
    <div className="ba-root">
      <div className="ba-frame">
        <img src={beforeSrc} alt={beforeLabel} className="ba-image" />
        <div className="ba-after-layer" style={{ clipPath: `inset(0 0 0 ${position}%)` }}>
          <img src={afterSrc} alt={afterLabel} className="ba-image" />
        </div>
        <div className="ba-handle" style={{ left: `${position}%` }} />
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
        onChange={(e) => setPosition(Number(e.target.value))}
      />
    </div>
  );
}

