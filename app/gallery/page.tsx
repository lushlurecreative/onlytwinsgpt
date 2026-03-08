import PremiumButton from "@/components/PremiumButton";
import AICapabilitiesGallery from "@/components/AICapabilitiesGallery";
import { galleryItems } from "@/lib/gallery-data";

export const dynamic = "force-static";

export default function GalleryPage() {
  return (
    <main style={{ padding: 24, maxWidth: 1100, margin: "0 auto" }}>
      <section className="hero hero-refined">
        <p className="eyebrow">AI Capabilities Gallery</p>
        <h1>See What Your Twin Can Create</h1>
        <p>
          Explore example outputs across styles, moods, settings, and content types.
        </p>
        <div className="cta-row">
          <PremiumButton href="/pricing">Start Subscription</PremiumButton>
          <PremiumButton href="/start" variant="secondary">
            Open Dashboard
          </PremiumButton>
        </div>
      </section>

      <section className="section">
        <AICapabilitiesGallery items={galleryItems} />
      </section>
    </main>
  );
}
