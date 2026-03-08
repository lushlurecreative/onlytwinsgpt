"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import type { GalleryCategory, GalleryItem } from "@/lib/gallery-data";
import { galleryCategories } from "@/lib/gallery-data";
import GalleryCategoryTabs from "@/components/GalleryCategoryTabs";
import BlurredNSFWCard from "@/components/BlurredNSFWCard";

type AICapabilitiesGalleryProps = {
  items: GalleryItem[];
  maxItems?: number;
  previewMode?: boolean;
};

function matchCategory(item: GalleryItem, selectedCategory: GalleryCategory) {
  if (selectedCategory === "All") return true;
  if (selectedCategory === "SFW") return !item.nsfw;
  if (selectedCategory === "NSFW") return item.nsfw;
  return item.category === selectedCategory;
}

export default function AICapabilitiesGallery({
  items,
  maxItems,
  previewMode = false,
}: AICapabilitiesGalleryProps) {
  const [selectedCategory, setSelectedCategory] = useState<GalleryCategory>("All");
  const [showNSFWPreviews, setShowNSFWPreviews] = useState(false);
  const [revealedNSFW, setRevealedNSFW] = useState<Record<string, boolean>>({});
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [loadedGrid, setLoadedGrid] = useState<Record<number, boolean>>({});
  const [failedGrid, setFailedGrid] = useState<Record<number, boolean>>({});
  const [loadedLightbox, setLoadedLightbox] = useState(false);
  const [failedLightbox, setFailedLightbox] = useState(false);
  const visibleItems = useMemo(() => {
    const filtered = items.filter((item) => matchCategory(item, selectedCategory));
    if (!maxItems || maxItems <= 0) return filtered;
    return filtered.slice(0, maxItems);
  }, [items, maxItems, selectedCategory]);

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

  const revealNSFW = (item: GalleryItem) => {
    setShowNSFWPreviews(true);
    setRevealedNSFW((prev) => ({ ...prev, [item.src]: true }));
  };

  return (
    <>
      {!previewMode ? (
        <div className="gallery-controls">
          <GalleryCategoryTabs
            categories={galleryCategories}
            selected={selectedCategory}
            onSelect={(category) => {
              setSelectedCategory(category);
              setActiveIndex(null);
            }}
          />
          <label className="gallery-nsfw-toggle">
            <input
              type="checkbox"
              checked={showNSFWPreviews}
              onChange={(event) => setShowNSFWPreviews(event.target.checked)}
            />
            <span>Show NSFW previews</span>
          </label>
        </div>
      ) : null}

      <div className="ai-gallery-grid">
        {visibleItems.map((item, index) => (
          <motion.button
            key={`${item.src}-${item.title}`}
            type="button"
            className="ai-gallery-card"
            onClick={() => {
              const hiddenNSFW = item.nsfw && !showNSFWPreviews && !revealedNSFW[item.src];
              if (hiddenNSFW) {
                revealNSFW(item);
                return;
              }
              setActiveIndex(index);
              setLoadedLightbox(false);
              setFailedLightbox(false);
            }}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.22, delay: index * 0.02 }}
          >
            <BlurredNSFWCard
              isNSFW={item.nsfw}
              revealed={!!revealedNSFW[item.src]}
              showPreview={showNSFWPreviews}
              onReveal={() => revealNSFW(item)}
            >
              <div className="ai-gallery-image-wrap">
                {item.type === "video" ? (
                  failedGrid[index] ? (
                    <div className="ai-gallery-missing">Video placeholder - add media file</div>
                  ) : (
                    <video
                      src={item.src}
                      className={`ai-gallery-image ${loadedGrid[index] ? "is-loaded" : ""}`.trim()}
                      muted
                      playsInline
                      preload="metadata"
                      onLoadedData={() => setLoadedGrid((prev) => ({ ...prev, [index]: true }))}
                      onError={() => setFailedGrid((prev) => ({ ...prev, [index]: true }))}
                    />
                  )
                ) : (
                  failedGrid[index] ? (
                    <div className="ai-gallery-missing">Image placeholder - add media file</div>
                  ) : (
                    <img
                      src={item.src}
                      alt={`${item.category} example`}
                      className={`ai-gallery-image ${loadedGrid[index] ? "is-loaded" : ""}`.trim()}
                      loading="lazy"
                      decoding="async"
                      onLoad={() => setLoadedGrid((prev) => ({ ...prev, [index]: true }))}
                      onError={() => setFailedGrid((prev) => ({ ...prev, [index]: true }))}
                    />
                  )
                )}
                {!loadedGrid[index] && !failedGrid[index] ? (
                  <div className="ai-gallery-image-placeholder" aria-hidden="true" />
                ) : null}
              </div>
            </BlurredNSFWCard>
            <div className="ai-gallery-content">
              <div className="ai-gallery-meta">
                <span className="ai-gallery-category">{item.category}</span>
                <span className="ai-gallery-type">{item.type}</span>
              </div>
              <h3 className="ai-gallery-title">{item.category} Example</h3>
              <p className="ai-gallery-description">{item.description}</p>
              <div className="ai-gallery-tags">
                {item.audience.map((aud) => (
                  <span className="ai-gallery-tag" key={aud}>
                    {aud}
                  </span>
                ))}
                <span className="ai-gallery-tag">{item.vertical}</span>
                <span className="ai-gallery-tag">{item.nsfw ? "NSFW" : "SFW"}</span>
              </div>
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
              {activeItem.type === "video" ? (
                failedLightbox ? (
                  <div className="ai-gallery-lightbox-missing">Video missing. Add this file in `public/gallery`.</div>
                ) : (
                  <video
                    src={activeItem.src}
                    className={`ai-gallery-lightbox-image ${loadedLightbox ? "is-loaded" : ""}`.trim()}
                    controls
                    autoPlay
                    playsInline
                    onLoadedData={() => setLoadedLightbox(true)}
                    onError={() => setFailedLightbox(true)}
                  />
                )
              ) : (
                failedLightbox ? (
                  <div className="ai-gallery-lightbox-missing">Image missing. Add this file in `public/gallery`.</div>
                ) : (
                  <img
                    src={activeItem.src}
                    alt={`${activeItem.category} example`}
                    className={`ai-gallery-lightbox-image ${loadedLightbox ? "is-loaded" : ""}`.trim()}
                    onLoad={() => setLoadedLightbox(true)}
                    onError={() => setFailedLightbox(true)}
                  />
                )
              )}
              {!loadedLightbox && !failedLightbox ? (
                <div className="ai-gallery-lightbox-placeholder" aria-hidden="true" />
              ) : null}
              <div className="ai-gallery-lightbox-copy">
                <span className="ai-gallery-category">{activeItem.category}</span>
                <h3>{activeItem.category} Example</h3>
                <p>{activeItem.description}</p>
                <div className="ai-gallery-tags">
                  {activeItem.audience.map((aud) => (
                    <span className="ai-gallery-tag" key={aud}>
                      {aud}
                    </span>
                  ))}
                  <span className="ai-gallery-tag">{activeItem.vertical}</span>
                  <span className="ai-gallery-tag">{activeItem.nsfw ? "NSFW" : "SFW"}</span>
                </div>
              </div>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </>
  );
}
