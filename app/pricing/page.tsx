import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase-server";
import { MARKETING_MESSAGE_MAP } from "@/lib/marketing-message-map";
import BrandName from "@/app/components/BrandName";
import CheckoutNowButton from "./CheckoutNowButton";
import BitcoinCheckoutButton from "./BitcoinCheckoutButton";

export default async function PricingPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login?redirectTo=/pricing");
  }

  return (
    <div>
      <section className="hero">
        <p className="eyebrow">Pricing</p>
        <h1>Professional content packages for serious creators and teams.</h1>
        <p>
          Built for mid-tier to high-end earners who need reliable, platform-ready output. Not for
          first-time hobby testing.
        </p>
      </section>

      <section className="feature-grid section">
        <article className="card">
          <h2>
            <BrandName /> Starter
          </h2>
          <p className="kpi">$299</p>
          <p>For established creators needing consistent monthly output.</p>
          <ul className="list">
            <li>45 AI images + 5 AI videos / month</li>
            <li>Native 4:5 and 9:16 outputs</li>
            <li>Metadata scrub + EXIF injection</li>
          </ul>
          <div className="cta-row">
            <CheckoutNowButton plan="starter">{MARKETING_MESSAGE_MAP.cta.primaryLabel}</CheckoutNowButton>
            <BitcoinCheckoutButton plan="starter" />
          </div>
        </article>
        <article className="card">
          <h2>
            <BrandName /> Professional
          </h2>
          <p className="kpi">
            $599<span style={{ fontSize: 16, fontWeight: 600 }}>/month</span>
          </p>
          <p>For higher-earning accounts scaling volume and format coverage.</p>
          <ul className="list">
            <li>90 AI images + 15 AI videos / month</li>
            <li>4:5, 9:16, and 1:1 multi-aspect output</li>
            <li>High-res post processing + face restoration</li>
          </ul>
          <div className="cta-row">
            <CheckoutNowButton plan="professional">{MARKETING_MESSAGE_MAP.cta.primaryLabel}</CheckoutNowButton>
            <BitcoinCheckoutButton plan="professional" />
            <a href="/contact" className="btn btn-secondary">
              Contact Us
            </a>
          </div>
        </article>
        <article className="card">
          <h2>
            <BrandName /> Elite
          </h2>
          <p className="kpi">
            $1,299<span style={{ fontSize: 16, fontWeight: 600 }}>/month</span>
          </p>
          <p>For top accounts and agencies demanding enterprise-level consistency.</p>
          <ul className="list">
            <li>200 AI images + 35 AI videos / month</li>
            <li>Advanced identity weight calibration</li>
            <li>Priority production and custom scene requests</li>
          </ul>
          <div className="cta-row">
            <CheckoutNowButton plan="elite">{MARKETING_MESSAGE_MAP.cta.primaryLabel}</CheckoutNowButton>
            <BitcoinCheckoutButton plan="elite" />
            <a href="/contact" className="btn btn-primary">
              Contact Us
            </a>
          </div>
        </article>
      </section>

      <section className="feature-grid section">
        <article className="card">
          <h3>Single Content Batch</h3>
          <p className="kpi">$399</p>
          <p>One-time purchase for urgent launches and test campaigns.</p>
          <div className="cta-row">
            <CheckoutNowButton plan="single_batch">Checkout</CheckoutNowButton>
            <BitcoinCheckoutButton plan="single_batch" />
          </div>
        </article>
        <article className="card">
          <h3>70/30 Partner Package</h3>
          <p className="kpi">$100/mo + rev share</p>
          <p>
            Lower upfront cost with profit share. Best fit for creators with strong growth potential.
          </p>
          <div className="cta-row">
            <CheckoutNowButton plan="partner_70_30">Checkout</CheckoutNowButton>
            <BitcoinCheckoutButton plan="partner_70_30" />
          </div>
        </article>
        <article className="card">
          <h3>50/50 Partner Package</h3>
          <p className="kpi">$1/mo + rev share</p>
          <p>
            Deep partnership structure with equity-style economics for select high-opportunity
            accounts.
          </p>
          <div className="cta-row">
            <CheckoutNowButton plan="partner_50_50">Checkout</CheckoutNowButton>
            <BitcoinCheckoutButton plan="partner_50_50" />
          </div>
        </article>
      </section>

      <section className="section card">
        <h3>Why we are different from app tools</h3>
        <ul className="list">
          <li>Done-for-you production team, not DIY prompts and guesswork</li>
          <li>Dynamic Scene Mapping: Beach, Gym, City, and Instagram presets</li>
          <li>Metadata Scrubber: strips AI signatures and file DNA</li>
          <li>EXIF Injector: iPhone/Sony A7 native-style metadata injection</li>
          <li>Deep Focus Control: forced f/8-f/11 style depth behavior</li>
          <li>Multi-Aspect Ratio Output: 4:5, 9:16, and 1:1 delivery formats</li>
          <li>High-Res Post-Processing: 50-step inference + face restoration</li>
          <li>Identity Weight Calibration: controlled body-to-face blending</li>
        </ul>
      </section>

      <section className="section card">
        <h3>Other products and infrastructure</h3>
        <ul className="list">
          <li>Direct content sale portal: one-click 30, 100, and 250-piece packs</li>
          <li>70/30 and 50/50 profit-share tracking interfaces</li>
          <li>Lead Generation &amp; Scraping (The Fleet)</li>
          <li>Mother-Child fleet management for centralized account control</li>
          <li>14-day automated warming for worker account humanization</li>
          <li>HydraProxy integration for residential IP rotation</li>
          <li>SMSPVA integration for SMS verification and recovery</li>
          <li>Whale filtering via competitor and luxury lead tags</li>
          <li>Automated DM/outreach scripts for funnel routing</li>
          <li>Custom scene request flows for Elite and Founder tiers</li>
        </ul>
        <div className="cta-row">
          <a href="/contact" className="btn btn-secondary">
            Talk to us about fit
          </a>
          <CheckoutNowButton plan="starter">{MARKETING_MESSAGE_MAP.cta.primaryLabel}</CheckoutNowButton>
        </div>
      </section>

      <section className="section card">
        <h3>Payment methods</h3>
        <ul className="list">
          <li>Supported now: Stripe card checkout and Bitcoin checkout.</li>
          <li>Amazon Pay is not active yet in this release.</li>
        </ul>
      </section>
    </div>
  );
}

