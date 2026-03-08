export type GalleryItem = {
  src: string;
  title: string;
  category: string;
  description: string;
  tags?: string[];
};

export const galleryItems: GalleryItem[] = [
  {
    src: "/gallery/studio-01.jpg",
    title: "Studio Portrait",
    category: "Studio",
    description: "Clean studio-quality AI portrait output with refined skin detail.",
    tags: ["Studio", "Soft Light", "Custom Style"],
  },
  {
    src: "/gallery/lifestyle-01.jpg",
    title: "City Lifestyle",
    category: "Lifestyle",
    description: "Natural urban mood with premium editorial framing.",
    tags: ["Lifestyle", "Editorial", "Outdoor"],
  },
  {
    src: "/gallery/glamour-01.jpg",
    title: "Glamour Session",
    category: "Glamour",
    description: "High-polish look for premium social and subscriber content.",
    tags: ["Glamour", "Luxury", "Soft Light"],
  },
  {
    src: "/gallery/editorial-01.jpg",
    title: "Editorial Feature",
    category: "Editorial",
    description: "Magazine-style composition with controlled cinematic tones.",
    tags: ["Editorial", "Dark Mood", "Custom Style"],
  },
  {
    src: "/gallery/selfie-01.jpg",
    title: "Premium Selfie",
    category: "Selfie",
    description: "Natural selfie output with identity consistency and realism.",
    tags: ["Selfie", "Lifestyle"],
  },
  {
    src: "/gallery/outdoor-01.jpg",
    title: "Golden Hour Outdoor",
    category: "Outdoor",
    description: "Warm natural-light scene tuned for social engagement.",
    tags: ["Outdoor", "Lifestyle", "Soft Light"],
  },
  {
    src: "/gallery/luxury-01.jpg",
    title: "Luxury Lifestyle",
    category: "Luxury",
    description: "High-end environment styling for premium-brand presence.",
    tags: ["Luxury", "Editorial", "Custom Style"],
  },
  {
    src: "/gallery/darkmood-01.jpg",
    title: "Dark Mood Portrait",
    category: "Dark Mood",
    description: "Cinematic low-light mood with controlled highlights.",
    tags: ["Dark Mood", "Studio"],
  },
  {
    src: "/gallery/softlight-01.jpg",
    title: "Soft Light Beauty",
    category: "Soft Light",
    description: "Balanced tone and texture for elegant profile-focused results.",
    tags: ["Soft Light", "Glamour"],
  },
  {
    src: "/gallery/customstyle-01.jpg",
    title: "Custom Style Output",
    category: "Custom Style",
    description: "Custom-guided output aligned to creator-specific aesthetic goals.",
    tags: ["Custom Style", "Editorial", "Luxury"],
  },
];
