import { MARKETING_MESSAGE_MAP } from "@/lib/marketing-message-map";

export default function LegalPage() {
  return (
    <div>
      <section className="hero">
        <p className="eyebrow">Legal</p>
        <h1>Terms and privacy information.</h1>
        <p>This page outlines the core terms for our done-for-you AI content service.</p>
      </section>

      <section className="section split">
        <article className="card">
          <h3>Terms of Service (TOS)</h3>
          <ul className="list">
            <li>Subscriptions are billed monthly based on your selected package.</li>
            <li>You are responsible for providing lawful sample materials.</li>
            <li>Deliverables are provided according to your selected plan scope.</li>
            <li>By submitting samples, you confirm you own rights or permission to use them.</li>
            <li>Partnership plans include revenue-share terms defined in your agreement.</li>
          </ul>
        </article>
        <article className="card">
          <h3>Privacy and Data Handling</h3>
          <ul className="list">
            <li>We collect only the data needed to deliver the subscribed service.</li>
            <li>We do not sell personal information.</li>
            <li>Uploaded samples are handled with reasonable security controls.</li>
            <li>Model-training and generation logs are retained for quality and dispute resolution.</li>
          </ul>
        </article>
      </section>

      <section className="section card">
        <h3>Content Rights and Protection</h3>
        <ul className="list">
          <li>Licensing, usage rights, and revocation are governed by your signed package agreement.</li>
          <li>If delivered content is platform-removed under covered guarantee terms, refund policy applies.</li>
          <li>Copyright/IP disputes are reviewed using service generation records and logs.</li>
        </ul>
      </section>

      <section className="section card">
        <h3>Questions about legal terms?</h3>
        <div className="cta-row">
          <a href="/contact" className="btn btn-secondary">
            Contact Us
          </a>
          <a href={MARKETING_MESSAGE_MAP.cta.primaryHref} className="btn btn-primary">
            {MARKETING_MESSAGE_MAP.cta.primaryLabel}
          </a>
        </div>
      </section>
    </div>
  );
}

