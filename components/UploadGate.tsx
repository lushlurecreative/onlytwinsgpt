"use client";

import { useRef, useState, useCallback } from "react";
import { motion } from "framer-motion";
import { galleryItems } from "@/lib/gallery-data";

type Props = {
  onComplete: (photos: string[]) => void;
};

const sampleItems = galleryItems.filter((i) => !i.nsfw && i.type === "image").slice(0, 4);

export default function UploadGate({ onComplete }: Props) {
  const [slots, setSlots] = useState<(string | null)[]>([null, null, null]);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const addFiles = useCallback((fileList: FileList | null) => {
    if (!fileList) return;
    const images = Array.from(fileList).filter((f) => f.type.startsWith("image/"));
    setSlots((prev) => {
      const next = [...prev];
      for (const file of images) {
        const idx = next.findIndex((s) => s === null);
        if (idx === -1) break;
        next[idx] = URL.createObjectURL(file);
      }
      return next;
    });
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragging(false);
      addFiles(e.dataTransfer.files);
    },
    [addFiles]
  );

  const removeSlot = (i: number) => {
    setSlots((prev) => {
      const next = [...prev];
      if (next[i]?.startsWith("blob:")) URL.revokeObjectURL(next[i]!);
      next[i] = null;
      return next;
    });
  };

  const filled = slots.filter(Boolean).length;
  const ready = filled === 3;

  const handleSubmit = () => {
    if (ready) onComplete(slots as string[]);
  };

  const handleSample = (src: string) => {
    onComplete([src, src, src]);
  };

  return (
    <motion.div
      className="ug-root"
      initial={{ opacity: 1 }}
      exit={{ y: "-100%", opacity: 0 }}
      transition={{ duration: 0.7, ease: [0.76, 0, 0.24, 1] }}
    >
      <div className="ug-inner">
        {/* Headline */}
        <p className="ug-eyebrow">AI content — personalised to your face</p>
        <h1 className="ug-headline">
          See yourself in<br />
          <span className="ug-headline-accent">20+ AI scenarios</span>
        </h1>
        <p className="ug-sub">
          Drop 3 photos. We&apos;ll show you the exact style of content we generate — free, before you pay anything.
        </p>

        {/* Drop zone */}
        <div
          className={`ug-zone ${dragging ? "ug-zone-drag" : ""} ${ready ? "ug-zone-ready" : ""}`}
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => e.key === "Enter" && inputRef.current?.click()}
          aria-label="Upload your photos"
        >
          {filled === 0 ? (
            <div className="ug-zone-empty">
              <div className="ug-zone-icon">
                <svg width="40" height="40" viewBox="0 0 40 40" fill="none">
                  <circle cx="20" cy="20" r="19" stroke="currentColor" strokeWidth="1.5" strokeDasharray="4 3" />
                  <path d="M20 13v14M13 20h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                </svg>
              </div>
              <p className="ug-zone-label">Drop 3 photos here</p>
              <p className="ug-zone-hint">or click to browse — JPG, PNG, HEIC</p>
            </div>
          ) : (
            <div className="ug-previews">
              {slots.map((src, i) => (
                <div key={i} className="ug-preview-slot">
                  {src ? (
                    <>
                      <img src={src} alt={`Photo ${i + 1}`} className="ug-preview-img" />
                      <button
                        className="ug-preview-remove"
                        onClick={(e) => { e.stopPropagation(); removeSlot(i); }}
                        aria-label={`Remove photo ${i + 1}`}
                      >
                        ×
                      </button>
                    </>
                  ) : (
                    <div className="ug-preview-empty">
                      <span>+</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
          {filled > 0 && filled < 3 && (
            <p className="ug-zone-status">Add {3 - filled} more photo{3 - filled === 1 ? "" : "s"}</p>
          )}
          {ready && <p className="ug-zone-status ug-zone-status-ready">3 photos ready ✓</p>}
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            multiple
            style={{ display: "none" }}
            onChange={(e) => addFiles(e.target.files)}
          />
        </div>

        {/* CTA */}
        <button
          className={`ug-cta ${ready ? "ug-cta-ready" : ""}`}
          onClick={handleSubmit}
          disabled={!ready}
        >
          {ready ? "Reveal my AI scenarios →" : `Add ${3 - filled} more photo${3 - filled === 1 ? "" : "s"}`}
        </button>

        {/* Social proof */}
        <p className="ug-proof">Join 2,400+ creators already using OnlyTwins</p>

        {/* Samples */}
        <div className="ug-divider"><span>or try with a sample</span></div>
        <div className="ug-samples">
          {sampleItems.map((item, i) => (
            <button
              key={i}
              type="button"
              className="ug-sample"
              onClick={() => handleSample(item.src)}
              aria-label={`Use ${item.title} sample`}
            >
              <img src={item.src} alt={item.title} />
              <span className="ug-sample-label">{item.title}</span>
            </button>
          ))}
        </div>
      </div>
    </motion.div>
  );
}
