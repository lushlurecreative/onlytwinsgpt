import { MARKETING_MESSAGE_MAP } from "@/lib/marketing-message-map";
import BeforeAfterSlider from "@/app/components/BeforeAfterSlider";

export default function ResultsPage() {
  return (
    <div>
      <section className="hero">
        <p className="eyebrow">Results</p>
        <h1>Before/after samples from real-style transformations.</h1>
        <p>
          The same uploaded identity can be mapped into multiple scenes while preserving consistency.
        </p>
      </section>

      <section className="results-grid section">
        <article className="card">
          <h3>Beach scene sample</h3>
          <BeforeAfterSlider
            beforeSrc="/hero-before.svg"
            afterSrc="/hero-after.svg"
            beforeLabel="Upload"
            afterLabel="Beach"
          />
        </article>
        <article className="card">
          <h3>Gym scene sample</h3>
          <BeforeAfterSlider
            beforeSrc="/hero-before.svg"
            afterSrc="/hero-after-gym.svg"
            beforeLabel="Upload"
            afterLabel="Gym"
          />
        </article>
        <article className="card">
          <h3>City scene sample</h3>
          <BeforeAfterSlider
            beforeSrc="/hero-before.svg"
            afterSrc="/hero-after-city.svg"
            beforeLabel="Upload"
            afterLabel="City"
          />
        </article>
      </section>

      <section className="section card">
        <h3>Why this matters</h3>
        <ul className="list">
          <li>No repeated physical photoshoots for every new theme</li>
          <li>Lower monthly production cost at scale</li>
          <li>Faster campaign testing across multiple scene concepts</li>
        </ul>
        <div className="cta-row">
          <a href={MARKETING_MESSAGE_MAP.cta.primaryHref} className="btn btn-primary">
            {MARKETING_MESSAGE_MAP.cta.primaryLabel}
          </a>
          <a href="/contact" className="btn btn-secondary">
            Contact Us
          </a>
        </div>
      </section>
    </div>
  );
}

