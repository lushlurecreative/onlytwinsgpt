import { MARKETING_MESSAGE_MAP } from "@/lib/marketing-message-map";
import BrandName from "@/app/components/BrandName";

export default function AboutPage() {
  return (
    <div>
      <section className="hero">
        <p className="eyebrow">About</p>
        <h1>
          <BrandName /> is a done-for-you AI content studio.
        </h1>
        <p>
          We help creators and agencies get consistent AI content without technical setup or complex
          workflows.
        </p>
      </section>

      <section className="split section">
        <article className="card">
          <h3>Our mission</h3>
          <p>
            Make high-quality AI content production accessible through a simple monthly service model.
          </p>
        </article>
        <article className="card">
          <h3>Our approach</h3>
          <p>
            You subscribe, upload sample photos, we train LoRA models, and deliver finished content.
          </p>
        </article>
      </section>

      <section className="section card">
        <h3>What we offer</h3>
        <ul className="list">
          <li>One-off generation packages for campaign bursts</li>
          <li>Monthly subscriptions with request-based scene mapping</li>
          <li>Partnership packages with low upfront cost and revenue share</li>
        </ul>
        <div className="cta-row">
          <a href={MARKETING_MESSAGE_MAP.cta.primaryHref} className="btn btn-primary">
            {MARKETING_MESSAGE_MAP.cta.primaryLabel}
          </a>
        </div>
      </section>
    </div>
  );
}

