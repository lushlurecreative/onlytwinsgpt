import { MARKETING_MESSAGE_MAP } from "@/lib/marketing-message-map";

export default function ContactPage() {
  return (
    <div>
      <section className="hero">
        <p className="eyebrow">Contact</p>
        <h1>Contact us about your content subscription.</h1>
        <p>Tell us your goals and we will reply with the right package and next steps. AI chat support is available 24/7.</p>
      </section>

      <section className="split section">
        <article className="card">
          <h3>General inquiries</h3>
          <p>
            <a href="mailto:hello@onlytwins.dev">hello@onlytwins.dev</a>
          </p>
          <p className="muted">Best for creator questions and onboarding details.</p>
        </article>
        <article className="card">
          <h3>Agencies and partnerships</h3>
          <p>
            <a href="mailto:partnerships@onlytwins.dev">partnerships@onlytwins.dev</a>
          </p>
          <p className="muted">Best for multi-client plans and custom monthly production.</p>
        </article>
      </section>

      <section className="section card">
        <h3>Expected response time</h3>
        <p className="section-copy">
          We typically respond within one business day with clear onboarding and package guidance.
        </p>
        <div className="cta-row">
          <a href="mailto:hello@onlytwins.dev?subject=OnlyTwins%20Support" className="btn btn-primary">
            Email Support
          </a>
          <a href={MARKETING_MESSAGE_MAP.cta.primaryHref} className="btn btn-secondary">
            {MARKETING_MESSAGE_MAP.cta.primaryLabel}
          </a>
        </div>
      </section>
    </div>
  );
}

