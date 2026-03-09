import { WHATSAPP_LINK, WHATSAPP_NUMBER_DISPLAY } from "@/lib/support";

export default function PrivacyPage() {
  return (
    <div className="section" style={{ maxWidth: 860, margin: "0 auto" }}>
      <h1>Privacy Policy - OnlyTwins</h1>
      <p>
        <strong>Privacy Policy</strong>
        <br />
        Effective Date: March 2, 2026
      </p>
      <p>
        OnlyTwins (&quot;we&quot;, &quot;our&quot;, &quot;us&quot;) respects your privacy. This Privacy Policy explains what
        information we collect and how we use it.
      </p>

      <h2>1. Information We Collect</h2>
      <ul className="list">
        <li>Account information (email address, authentication provider)</li>
        <li>Payment information (processed securely via Stripe; we do not store full card details)</li>
        <li>Usage data (basic analytics, logs, device/browser data)</li>
        <li>Content and uploads associated with your account</li>
      </ul>

      <h2>2. How We Use Information</h2>
      <ul className="list">
        <li>To provide access to our services</li>
        <li>To process payments and manage subscriptions</li>
        <li>To improve performance and security</li>
        <li>To communicate important service updates</li>
      </ul>

      <h2>3. Payments</h2>
      <p>
        Payments are processed by Stripe. We do not store credit card numbers on our servers.
      </p>

      <h2>4. Authentication</h2>
      <p>
        We use Supabase authentication and third-party providers (such as Google) to manage login
        access.
      </p>

      <h2>5. Data Sharing</h2>
      <p>We do not sell personal data.</p>
      <p>
        We may share data with trusted service providers (Stripe, Supabase, hosting providers)
        solely to operate the platform.
      </p>

      <h2>6. Data Retention</h2>
      <p>
        We retain account data while your subscription is active. You may request deletion by
        contacting us on WhatsApp.
      </p>

      <h2>7. Security</h2>
      <p>We use industry-standard safeguards to protect user data.</p>

      <h2>8. Your Rights</h2>
      <p>
        You may request access, correction, or deletion of your data by contacting:
        <br />
        <a href={WHATSAPP_LINK} target="_blank" rel="noopener noreferrer">
          WhatsApp: {WHATSAPP_NUMBER_DISPLAY}
        </a>
      </p>

      <h2>9. Contact</h2>
      <p>
        For privacy questions, contact:
        <br />
        <a href={WHATSAPP_LINK} target="_blank" rel="noopener noreferrer">
          WhatsApp: {WHATSAPP_NUMBER_DISPLAY}
        </a>
      </p>
    </div>
  );
}
