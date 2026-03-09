"use client";

type ControlIconProps = {
  glyph: string;
  label: string;
};

export default function ControlIcon({ glyph, label }: ControlIconProps) {
  return (
    <span className="control-icon" aria-label={label} title={label}>
      <span>{glyph}</span>
    </span>
  );
}
