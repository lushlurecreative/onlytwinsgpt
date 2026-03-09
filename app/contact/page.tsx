import AuthAwarePrimaryCta from "@/components/AuthAwarePrimaryCta";
import { WHATSAPP_LINK, WHATSAPP_NUMBER_DISPLAY } from "@/lib/support";

export default function ContactPage() {
  return (
    <div>
      <section className="hero">
        <p className="eyebrow">Contact</p>
        <h1>Message us on WhatsApp.</h1>
        <p>Tell us your goals and we will reply with the right package and next steps.</p>
      </section>

      <section className="split section">
        <article className="card">
          <h3>WhatsApp support</h3>
          <p>
            <a href={WHATSAPP_LINK} target="_blank" rel="noopener noreferrer">
              WhatsApp: {WHATSAPP_NUMBER_DISPLAY}
            </a>
          </p>
          <p className="muted">Best for onboarding, billing, account, and request planning support.</p>
        </article>
        <article className="card">
          <h3>Agencies and partnerships</h3>
          <p>
            <a href={WHATSAPP_LINK} target="_blank" rel="noopener noreferrer">
              WhatsApp: {WHATSAPP_NUMBER_DISPLAY}
            </a>
          </p>
          <p className="muted">Best for multi-client plans and custom monthly production.</p>
        </article>
      </section>

      <section className="section card">
        <h3>Expected response time</h3>
        <p className="section-copy">
          We typically respond quickly on WhatsApp with clear onboarding and package guidance.
        </p>
        <div className="cta-row">
          <a href={WHATSAPP_LINK} target="_blank" rel="noopener noreferrer" className="btn btn-primary">
            WhatsApp: {WHATSAPP_NUMBER_DISPLAY}
          </a>
          <AuthAwarePrimaryCta className="btn btn-secondary" />
        </div>
      </section>
    </div>
  );
}

