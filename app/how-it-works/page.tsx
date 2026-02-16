import { MARKETING_MESSAGE_MAP } from "@/lib/marketing-message-map";

export default function HowItWorksPage() {
  return (
    <div>
      <section className="hero">
        <p className="eyebrow">How It Works</p>
        <h1>How the service works from signup to delivery.</h1>
        <p>
          This is a done-for-you workflow. You do not generate content yourself. We handle production
          for you.
        </p>
      </section>

      <section className="feature-grid section">
        <article className="card">
          <h3>1) {MARKETING_MESSAGE_MAP.process[0].title}</h3>
          <p>{MARKETING_MESSAGE_MAP.process[0].detail}</p>
        </article>
        <article className="card">
          <h3>2) {MARKETING_MESSAGE_MAP.process[1].title}</h3>
          <p>{MARKETING_MESSAGE_MAP.process[1].detail}</p>
        </article>
        <article className="card">
          <h3>3) {MARKETING_MESSAGE_MAP.process[2].title}</h3>
          <p>{MARKETING_MESSAGE_MAP.process[2].detail}</p>
        </article>
      </section>

      <section className="section card">
        <h3>What you need to do</h3>
        <ul className="list">
          <li>Choose your monthly package</li>
          <li>Send clear sample photos</li>
          <li>Review and use the delivered content</li>
        </ul>
        <div className="cta-row">
          <a href={MARKETING_MESSAGE_MAP.cta.primaryHref} className="btn btn-primary">
            {MARKETING_MESSAGE_MAP.cta.primaryLabel}
          </a>
          <a href="/results" className="btn btn-secondary">
            See Sample Results
          </a>
        </div>
      </section>
    </div>
  );
}

