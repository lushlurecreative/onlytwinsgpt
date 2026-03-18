"use client";

import { useRef, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { galleryItems } from "@/lib/gallery-data";

type Props = {
  onComplete: (photos: string[]) => void;
};

const sampleItems = galleryItems.filter((i) => !i.nsfw && i.type === "image").slice(0, 4);

export default function UploadGate({ onComplete }: Props) {
  const [slots, setSlots] = useState<(string | null)[]>([null, null, null]);
  const [draggingSlot, setDraggingSlot] = useState<number | null>(null);
  const inputRefs = [useRef<HTMLInputElement>(null), useRef<HTMLInputElement>(null), useRef<HTMLInputElement>(null)];

  const setSlot = useCallback((index: number, file: File) => {
    const url = URL.createObjectURL(file);
    setSlots((prev) => {
      const next = [...prev];
      next[index] = url;
      return next;
    });
  }, []);

  const handleFile = useCallback(
    (index: number, files: FileList | null) => {
      const file = files?.[0];
      if (!file || !file.type.startsWith("image/")) return;
      setSlot(index, file);
    },
    [setSlot]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent, index: number) => {
      e.preventDefault();
      setDraggingSlot(null);
      handleFile(index, e.dataTransfer.files);
    },
    [handleFile]
  );

  const handleSubmit = () => {
    const filled = slots.filter(Boolean) as string[];
    if (filled.length === 3) onComplete(filled);
  };

  const handleSample = (src: string) => {
    onComplete([src, src, src]);
  };

  const filled = slots.filter(Boolean).length;
  const ready = filled === 3;

  return (
    <motion.div
      className="upload-gate"
      initial={{ opacity: 1 }}
      exit={{ y: "-100%", opacity: 0 }}
      transition={{ duration: 0.65, ease: [0.76, 0, 0.24, 1] }}
    >
      <div className="upload-gate-inner">
        <p className="eyebrow" style={{ textAlign: "center", marginBottom: 8 }}>
          Personalised AI content
        </p>
        <h1 className="upload-gate-headline">
          See yourself in<br />
          <span style={{ color: "var(--accent)" }}>20+ AI scenarios</span>
        </h1>
        <p className="upload-gate-sub">
          Upload 3 photos and we&apos;ll show you exactly what we can create — before you pay a thing.
        </p>

        <div className="upload-slots">
          {slots.map((photo, i) => (
            <button
              key={i}
              type="button"
              className={`upload-slot ${photo ? "upload-slot-filled" : ""} ${draggingSlot === i ? "upload-slot-drag" : ""}`}
              onClick={() => inputRefs[i].current?.click()}
              onDragOver={(e) => { e.preventDefault(); setDraggingSlot(i); }}
              onDragLeave={() => setDraggingSlot(null)}
              onDrop={(e) => handleDrop(e, i)}
              aria-label={`Upload photo ${i + 1}`}
            >
              {photo ? (
                <img src={photo} alt={`Photo ${i + 1}`} className="upload-slot-preview" />
              ) : (
                <div className="upload-slot-empty">
                  <span className="upload-slot-icon">+</span>
                  <span className="upload-slot-label">Photo {i + 1}</span>
                </div>
              )}
              <input
                ref={inputRefs[i]}
                type="file"
                accept="image/*"
                style={{ display: "none" }}
                onChange={(e) => handleFile(i, e.target.files)}
              />
            </button>
          ))}
        </div>

        <button
          className={`btn btn-primary upload-gate-cta ${!ready ? "btn-gate-disabled" : ""}`}
          onClick={handleSubmit}
          disabled={!ready}
        >
          {filled < 3 ? `Add ${3 - filled} more photo${3 - filled === 1 ? "" : "s"}` : "Show me what's possible →"}
        </button>

        <div className="upload-gate-divider">
          <span>or try with a sample instead</span>
        </div>

        <div className="upload-gate-samples">
          {sampleItems.map((item, i) => (
            <button
              key={i}
              type="button"
              className="upload-sample-thumb"
              onClick={() => handleSample(item.src)}
              aria-label={`Use ${item.title} sample`}
            >
              <img src={item.src} alt={item.title} />
              <span className="upload-sample-label">{item.title}</span>
            </button>
          ))}
        </div>
      </div>
    </motion.div>
  );
}
