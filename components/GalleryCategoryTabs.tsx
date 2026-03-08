"use client";

import type { GalleryCategory } from "@/lib/gallery-data";

type GalleryCategoryTabsProps = {
  categories: readonly GalleryCategory[];
  selected: GalleryCategory;
  onSelect: (category: GalleryCategory) => void;
};

export default function GalleryCategoryTabs({
  categories,
  selected,
  onSelect,
}: GalleryCategoryTabsProps) {
  return (
    <div className="gallery-tabs">
      {categories.map((category) => (
        <button
          key={category}
          type="button"
          className={`gallery-tab ${selected === category ? "is-active" : ""}`.trim()}
          onClick={() => onSelect(category)}
        >
          {category}
        </button>
      ))}
    </div>
  );
}
