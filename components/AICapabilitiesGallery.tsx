"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import type { GalleryItem } from "@/lib/gallery-data";

type AICapabilitiesGalleryProps = {
  items: GalleryItem[];
  maxItems?: number;
};

export default function AICapabilitiesGallery({ items, maxItems }: AICapabilitiesGalleryProps) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [loadedGrid, setLoadedGrid] = useState<Record<number, boolean>>({});
  const [loadedLightbox, setLoadedLightbox] = useState(false);
  const visibleItems = useMemo(() => {
    if (!maxItems || maxItems <= 0) return items;
    return items.slice(0, maxItems);
  }, [items, maxItems]);

  const activeItem = activeIndex != null ? visibleItems[activeIndex] : null;
  const goPrev = useCallback(() => {
    setActiveIndex((prev) => {
      if (prev == null || visibleItems.length === 0) return prev;
      return (prev - 1 + visibleItems.length) % visibleItems.length;
    });
    setLoadedLightbox(false);
  }, [visibleItems.length]);
  const goNext = useCallback(() => {
    setActiveIndex((prev) => {
      if (prev == null || visibleItems.length === 0) return prev;
      return (prev + 1) % visibleItems.length;
    });
    setLoadedLightbox(false);
  }, [visibleItems.length]);

  useEffect(() => {
    if (activeIndex == null) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setActiveIndex(null);
      if (event.key === "ArrowLeft") goPrev();
      if (event.key === "ArrowRight") goNext();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [activeIndex, goNext, goPrev]);

  return (
    <>
      <div className="ai-gallery-grid">
        {visibleItems.map((item, index) => (
          <motion.button
            key={`${item.src}-${item.title}`}
            type="button"
            className="ai-gallery-card"
            onClick={() => setActiveIndex(index)}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.22, delay: index * 0.02 }}
          >
            <div className="ai-gallery-image-wrap">
              <img
                src={item.src}
                alt={item.title}
                className={`ai-gallery-image ${loadedGrid[index] ? "is-loaded" : ""}`.trim()}
                loading="lazy"
                decoding="async"
                onLoad={() => setLoadedGrid((prev) => ({ ...prev, [index]: true }))}
              />
              {!loadedGrid[index] ? <div className="ai-gallery-image-placeholder" aria-hidden="true" /> : null}
            </div>
            <div className="ai-gallery-content">
              <div className="ai-gallery-meta">
                <span className="ai-gallery-category">{item.category}</span>
              </div>
              <h3 className="ai-gallery-title">{item.title}</h3>
              <p className="ai-gallery-description">{item.description}</p>
              {item.tags?.length ? (
                <div className="ai-gallery-tags">
                  {item.tags.slice(0, 3).map((tag) => (
                    <span className="ai-gallery-tag" key={tag}>
                      {tag}
                    </span>
                  ))}
                </div>
              ) : null}
            </div>
          </motion.button>
        ))}
      </div>

      <AnimatePresence>
        {activeItem ? (
          <motion.div
            className="ai-gallery-lightbox"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setActiveIndex(null)}
          >
            <motion.div
              className="ai-gallery-lightbox-inner"
              initial={{ opacity: 0, y: 14, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 10, scale: 0.98 }}
              transition={{ duration: 0.2 }}
              onClick={(e) => e.stopPropagation()}
            >
              <button
                type="button"
                className="ai-gallery-close"
                onClick={() => setActiveIndex(null)}
                aria-label="Close image preview"
              >
                Close
              </button>
              <button
                type="button"
                className="ai-gallery-nav ai-gallery-nav-prev"
                onClick={goPrev}
                aria-label="Previous image"
              >
                ‹
              </button>
              <button
                type="button"
                className="ai-gallery-nav ai-gallery-nav-next"
                onClick={goNext}
                aria-label="Next image"
              >
                ›
              </button>
              <img
                src={activeItem.src}
                alt={activeItem.title}
                className={`ai-gallery-lightbox-image ${loadedLightbox ? "is-loaded" : ""}`.trim()}
                onLoad={() => setLoadedLightbox(true)}
              />
              {!loadedLightbox ? <div className="ai-gallery-lightbox-placeholder" aria-hidden="true" /> : null}
              <div className="ai-gallery-lightbox-copy">
                <span className="ai-gallery-category">{activeItem.category}</span>
                <h3>{activeItem.title}</h3>
                <p>{activeItem.description}</p>
                {activeItem.tags?.length ? (
                  <div className="ai-gallery-tags">
                    {activeItem.tags.map((tag) => (
                      <span className="ai-gallery-tag" key={tag}>
                        {tag}
                      </span>
                    ))}
                  </div>
                ) : null}
              </div>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </>
  );
}
