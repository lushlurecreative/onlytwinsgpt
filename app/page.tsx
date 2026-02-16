import { MARKETING_MESSAGE_MAP } from "@/lib/marketing-message-map";
import BeforeAfterSlider from "@/app/components/BeforeAfterSlider";

export default function Home() {
  return (
    <div>
      <section className="hero">
        <p className="eyebrow">{MARKETING_MESSAGE_MAP.positioning.eyebrow}</p>
        <h1>{MARKETING_MESSAGE_MAP.positioning.headline}</h1>
        <p>{MARKETING_MESSAGE_MAP.positioning.subheadline}</p>
        <div className="hero-slider-wrap">
          <BeforeAfterSlider
            beforeSrc="/hero-before.svg"
            afterSrc="/hero-after.svg"
            beforeLabel="User Upload"
            afterLabel="AI Beach Scene"
          />
        </div>
        <p className="hero-note">
          No more expensive photoshoots for every concept. One sample set can produce multiple
          lifestyle scenes every month.
        </p>
        <div className="cta-row">
          <a href={MARKETING_MESSAGE_MAP.cta.primaryHref} className="btn btn-primary">
            {MARKETING_MESSAGE_MAP.cta.primaryLabel}
          </a>
          <a href="/how-it-works" className="btn btn-secondary">
            See How It Works
          </a>
          <a href={MARKETING_MESSAGE_MAP.cta.secondaryHref} className="btn btn-secondary">
            {MARKETING_MESSAGE_MAP.cta.secondaryLabel}
          </a>
        </div>
      </section>

      <section className="section">
        <h2 className="section-title">What we do</h2>
        <p className="section-copy">
          We are a done-for-you AI content service. You subscribe, send sample photos, and receive
          finished monthly content from our team.
        </p>
      </section>

      <section className="feature-grid">
        <article className="card">
          <h3>Done for you</h3>
          <p>
            You do not generate content yourself. We handle model training and content production for
            you.
          </p>
        </article>
        <article className="card">
          <h3>Simple process</h3>
          <p>
            The workflow is clear: subscribe, upload samples, receive finished content every month.
          </p>
        </article>
        <article className="card">
          <h3>Built for real-world use</h3>
          <p>
            Clear communication, predictable delivery, and professional output you can publish.
          </p>
        </article>
        <article className="card">
          <h3>For creators and agencies</h3>
          <p>
            Whether you run your own brand or manage clients, we provide consistent monthly AI content.
          </p>
        </article>
      </section>

      <section className="section card">
        <h3>Onboarding scene presets</h3>
        <p className="section-copy">
          During onboarding, clients choose desired output scenes from preset dropdowns so production
          is aligned before model training starts.
        </p>
        <div className="preset-grid">
          <span className="preset-pill">Beach</span>
          <span className="preset-pill">Camping</span>
          <span className="preset-pill">Coffee shop</span>
          <span className="preset-pill">Swimsuit try-on</span>
          <span className="preset-pill">Gym</span>
          <span className="preset-pill">Casual home</span>
          <span className="preset-pill">Street style</span>
          <span className="preset-pill">Nightlife</span>
        </div>
      </section>

      <section className="section split">
        <article className="card">
          <h3>One-off generation packages</h3>
          <p>Need content fast without a monthly plan? Buy single high-quality content batches.</p>
        </article>
        <article className="card">
          <h3>Monthly subscription packages</h3>
          <p>
            Request your desired monthly photoshoot concept and receive consistent delivery on a
            schedule.
          </p>
        </article>
        <article className="card">
          <h3>Partnership packages</h3>
          <p>
            Get very affordable pricing in exchange for a revenue share percentage tied to generated
            content performance.
          </p>
        </article>
      </section>

      <section className="section split">
        <article className="card">
          <h3>How we deliver your content</h3>
          <p>A straightforward service workflow with no technical setup required on your side.</p>
          <ul className="list">
            {MARKETING_MESSAGE_MAP.process.map((step) => (
              <li key={step.title}>
                <strong>{step.title}:</strong> {step.detail}
              </li>
            ))}
          </ul>
          <div className="cta-row">
            <a href="/how-it-works" className="btn btn-secondary">
              View the full process
            </a>
          </div>
        </article>
        <article className="card">
          <h3>What you can expect</h3>
          <p>
            A monthly stream of finished content based on your samples, designed to match your brand
            style and audience expectations.
          </p>
          <div className="kpi">Monthly</div>
          <p className="muted">Reliable output cadence with clear delivery expectations.</p>
          <div className="cta-row">
            <a href="/results" className="btn btn-secondary">
              See sample outcomes
            </a>
          </div>
        </article>
      </section>

      <section className="section hero">
        <p className="eyebrow">Ready To Start</p>
        <h2>Get done-for-you AI content without the complexity.</h2>
        <p>
          Start your subscription, upload your samples, and let us handle the content production.
        </p>
        <div className="cta-row">
          <a href={MARKETING_MESSAGE_MAP.cta.primaryHref} className="btn btn-primary">
            {MARKETING_MESSAGE_MAP.cta.primaryLabel}
          </a>
          <a href={MARKETING_MESSAGE_MAP.cta.secondaryHref} className="btn btn-secondary">
            {MARKETING_MESSAGE_MAP.cta.secondaryLabel}
          </a>
        </div>
      </section>
    </div>
  );
}
