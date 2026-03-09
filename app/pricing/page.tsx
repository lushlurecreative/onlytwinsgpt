import { createClient } from "@/lib/supabase-server";
import { MARKETING_MESSAGE_MAP } from "@/lib/marketing-message-map";
import BrandName from "@/app/components/BrandName";
import PremiumCard from "@/components/PremiumCard";
import CheckoutNowButton from "./CheckoutNowButton";
import BitcoinCheckoutButton from "./BitcoinCheckoutButton";

export const dynamic = "force-dynamic";

export default async function PricingPage() {
  const supabase = await createClient();
  await supabase.auth.getUser();

  return (
    <div>
      <section className="hero hero-refined">
        <p className="eyebrow">Pricing</p>
        <h1>Choose the production tier that matches your growth.</h1>
        <p>
          Calm, predictable AI-native content operations with managed delivery.
        </p>
      </section>

      <section className="feature-grid section">
        <PremiumCard className="pricing-card">
          <h2>
            <BrandName /> Starter
          </h2>
          <p className="kpi">$299</p>
          <p>For creators who want reliable monthly output with minimal overhead.</p>
          <ul className="list">
            <li>45 AI images + 5 AI videos / month</li>
            <li>Native 4:5 and 9:16 outputs</li>
            <li>Delivery-ready file processing</li>
          </ul>
          <div className="cta-row">
            <CheckoutNowButton plan="starter">{MARKETING_MESSAGE_MAP.cta.primaryLabel}</CheckoutNowButton>
            <BitcoinCheckoutButton plan="starter" />
          </div>
        </PremiumCard>
        <PremiumCard className="pricing-card">
          <h2>
            <BrandName /> Professional
          </h2>
          <p className="kpi">
            $599<span style={{ fontSize: 16, fontWeight: 600 }}>/month</span>
          </p>
          <p>For scaling brands that need more volume and format coverage.</p>
          <ul className="list">
            <li>90 AI images + 15 AI videos / month</li>
            <li>4:5, 9:16, and 1:1 multi-aspect output</li>
            <li>Enhanced quality processing and consistency controls</li>
          </ul>
          <div className="cta-row">
            <CheckoutNowButton plan="professional">{MARKETING_MESSAGE_MAP.cta.primaryLabel}</CheckoutNowButton>
            <BitcoinCheckoutButton plan="professional" />
          </div>
        </PremiumCard>
        <PremiumCard className="pricing-card">
          <h2>
            <BrandName /> Elite
          </h2>
          <p className="kpi">
            $1,299<span style={{ fontSize: 16, fontWeight: 600 }}>/month</span>
          </p>
          <p>For high-output operators and teams requiring enterprise consistency.</p>
          <ul className="list">
            <li>200 AI images + 35 AI videos / month</li>
            <li>Advanced identity weight calibration</li>
            <li>Priority production and custom scene requests</li>
          </ul>
          <div className="cta-row">
            <CheckoutNowButton plan="elite">{MARKETING_MESSAGE_MAP.cta.primaryLabel}</CheckoutNowButton>
            <BitcoinCheckoutButton plan="elite" />
          </div>
        </PremiumCard>
      </section>

      <section className="feature-grid section">
        <PremiumCard className="pricing-card">
          <h3>Single Content Batch</h3>
          <p className="kpi">$399</p>
          <p>One-time delivery for campaigns that need immediate output.</p>
          <div className="cta-row">
            <CheckoutNowButton plan="single_batch">Checkout</CheckoutNowButton>
            <BitcoinCheckoutButton plan="single_batch" />
          </div>
        </PremiumCard>
        <PremiumCard className="pricing-card">
          <h3>70/30 Partner Package</h3>
          <p className="kpi">$100/mo + rev share</p>
          <p>Lower upfront cost with shared upside for high-potential growth accounts.</p>
          <div className="cta-row">
            <CheckoutNowButton plan="partner_70_30">Checkout</CheckoutNowButton>
            <BitcoinCheckoutButton plan="partner_70_30" />
          </div>
        </PremiumCard>
        <PremiumCard className="pricing-card">
          <h3>50/50 Partner Package</h3>
          <p className="kpi">$1/mo + rev share</p>
          <p>Deep partnership model for select accounts with strong strategic fit.</p>
          <div className="cta-row">
            <CheckoutNowButton plan="partner_50_50">Checkout</CheckoutNowButton>
            <BitcoinCheckoutButton plan="partner_50_50" />
          </div>
        </PremiumCard>
      </section>

      <section className="section">
        <PremiumCard>
          <h3>What you get with every tier</h3>
          <ul className="list">
            <li>Done-for-you AI production, not DIY prompt workflows</li>
            <li>Identity consistency controls and quality assurance</li>
            <li>Structured delivery cadence with clear status visibility</li>
          </ul>
          <div className="cta-row">
            <CheckoutNowButton plan="starter">{MARKETING_MESSAGE_MAP.cta.primaryLabel}</CheckoutNowButton>
          </div>
        </PremiumCard>
      </section>

      <section className="section">
        <PremiumCard>
          <h3>Payment methods</h3>
          <ul className="list">
            <li>Supported now: Stripe card checkout and Bitcoin checkout.</li>
            <li>Amazon Pay is not active yet in this release.</li>
          </ul>
        </PremiumCard>
      </section>
    </div>
  );
}

