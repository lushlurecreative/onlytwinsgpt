import { WHATSAPP_LINK, WHATSAPP_NUMBER_DISPLAY } from "@/lib/support";

export default function TermsPage() {
  return (
    <div className="section" style={{ maxWidth: 860, margin: "0 auto" }}>
      <h1>Terms of Service - OnlyTwins</h1>
      <p>
        <strong>Terms of Service</strong>
        <br />
        Effective Date: March 2, 2026
      </p>
      <p>By using OnlyTwins, you agree to these Terms.</p>

      <h2>1. Eligibility</h2>
      <p>You must be at least 18 years old to use this service.</p>

      <h2>2. Accounts</h2>
      <p>You are responsible for maintaining the security of your account and login credentials.</p>

      <h2>3. Subscriptions &amp; Billing</h2>
      <ul className="list">
        <li>Access is subscription-based.</li>
        <li>Payments are processed via Stripe.</li>
        <li>Fees are non-refundable unless required by law.</li>
        <li>You may cancel anytime; access continues until the end of the billing period.</li>
      </ul>

      <h2>4. Acceptable Use</h2>
      <p>You agree not to:</p>
      <ul className="list">
        <li>Violate any laws</li>
        <li>Attempt unauthorized access</li>
        <li>Abuse or disrupt the platform</li>
      </ul>

      <h2>5. Intellectual Property</h2>
      <p>All platform software, branding, and content are owned by OnlyTwins.</p>
      <p>Users retain ownership of their own uploaded content.</p>

      <h2>6. Termination</h2>
      <p>We may suspend or terminate accounts for violations of these Terms.</p>

      <h2>7. Disclaimer</h2>
      <p>The service is provided &quot;as is&quot; without warranties of any kind.</p>

      <h2>8. Limitation of Liability</h2>
      <p>
        OnlyTwins shall not be liable for indirect, incidental, or consequential damages arising
        from use of the platform.
      </p>

      <h2>9. Changes</h2>
      <p>
        We may update these Terms at any time. Continued use constitutes acceptance of changes.
      </p>

      <h2>10. Contact</h2>
      <p>
        For questions, contact:
        <br />
        <a href={WHATSAPP_LINK} target="_blank" rel="noopener noreferrer">
          WhatsApp: {WHATSAPP_NUMBER_DISPLAY}
        </a>
      </p>
    </div>
  );
}
