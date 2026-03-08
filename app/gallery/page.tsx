import PremiumButton from "@/components/PremiumButton";
import AICapabilitiesGallery from "@/components/AICapabilitiesGallery";
import { galleryItems } from "@/lib/gallery-data";
import GalleryCapabilitiesRow from "@/components/GalleryCapabilitiesRow";

export const dynamic = "force-static";

export default function GalleryPage() {
  const capabilityItems = [
    "Cosplay",
    "Vacation lifestyle",
    "Instagram-ready content",
    "TikTok / short-form aesthetics",
    "Fitness / gym content",
    "Exercise and activewear looks",
    "Lingerie",
    "Swimwear",
    "Alternative / goth",
    "Safe-for-work",
    "Adult content",
    "Luxury / glam",
    "Automotive / cars",
    "Motorcycles",
    "Anime-inspired",
    "Sci-fi looks",
    "Custom requests",
  ];

  const audienceItems = [
    "Individual Creators",
    "Agencies",
    "Adult Creators",
    "Non-Adult Creators",
    "Custom Brand / Visual Concepts",
  ];

  return (
    <main style={{ padding: 24, maxWidth: 1100, margin: "0 auto" }}>
      <section className="hero hero-refined">
        <p className="eyebrow">AI Capabilities Gallery</p>
        <h1>See What Your Twin Can Create</h1>
        <p>
          From clean lifestyle shots to cosplay, fitness, vacation, social content, automotive aesthetics,
          anime-inspired looks, and premium adult styles - your twin can be trained to match the exact look
          you want.
        </p>
        <p className="section-copy" style={{ maxWidth: 900 }}>
          Built for individual creators, agencies, and custom brand aesthetics. Train for the look, mood,
          niche, and content style you actually want.
        </p>
        <div className="cta-row">
          <PremiumButton href="/pricing">Start Subscription</PremiumButton>
          <PremiumButton href="/start" variant="secondary">
            Open Dashboard
          </PremiumButton>
        </div>
      </section>

      <section className="section">
        <GalleryCapabilitiesRow title="Capability Coverage" items={capabilityItems} />
      </section>

      <section className="section">
        <GalleryCapabilitiesRow title="Who This Supports" items={audienceItems} />
      </section>

      <section className="section">
        <AICapabilitiesGallery items={galleryItems} />
      </section>
    </main>
  );
}
