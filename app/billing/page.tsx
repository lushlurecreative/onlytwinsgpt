import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase-server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import PremiumCard from "@/components/PremiumCard";
import BillingPortalButton from "./BillingPortalButton";
import PremiumButton from "@/components/PremiumButton";
import { getCurrentSubscriptionSummary } from "@/lib/request-planner";
import { WHATSAPP_LINK, WHATSAPP_NUMBER_DISPLAY } from "@/lib/support";

function labelStatus(status: string) {
  const s = status.toLowerCase();
  if (s === "active") return "Active";
  if (s === "trialing") return "Trialing";
  if (s === "past_due") return "Past due";
  if (s === "canceled") return "Canceled";
  return "Unknown";
}

export default async function BillingPage() {
  const session = await createClient();
  const admin = getSupabaseAdmin();
  const {
    data: { user },
  } = await session.auth.getUser();

  if (!user) {
    redirect("/login?redirectTo=/billing");
  }

  const summary = await getCurrentSubscriptionSummary(admin, user.id);
  const planKey = summary.planKey;
  const planName =
    planKey === "starter"
      ? "Starter"
      : planKey === "professional"
        ? "Growth"
        : planKey === "elite"
          ? "Scale"
          : summary.planName;
  const allowanceSummary = `Includes ${summary.includedImages} photos and ${summary.includedVideos} videos per month`;
  const renewalLabel = summary.nextRenewalAt
    ? `Renews ${new Date(summary.nextRenewalAt).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      })}`
    : "Renewal date unavailable";
  const canUpgrade = planKey === "starter" || planKey === "professional";

  return (
    <main style={{ padding: 24, maxWidth: 980, margin: "0 auto" }}>
      <PremiumCard>
        <h1 style={{ marginTop: 0, fontSize: 34, letterSpacing: "-0.02em" }}>Billing</h1>
        <p className="section-copy" style={{ marginTop: 8 }}>
          Your billing overview and current subscription details.
        </p>
        <div
          style={{
            marginTop: 16,
            padding: 18,
            borderRadius: 16,
            border: "1px solid var(--line)",
            background: "rgba(255,255,255,0.74)",
            display: "grid",
            gap: 8,
          }}
        >
          <p style={{ margin: 0, opacity: 0.75 }}>Current plan</p>
          <h2 style={{ margin: 0, fontSize: 24 }}>{planName}</h2>
          <p style={{ margin: 0, opacity: 0.84 }}>{renewalLabel}</p>
          <p style={{ margin: 0, opacity: 0.84 }}>Status: {labelStatus(summary.status)}</p>
          <p style={{ margin: 0, opacity: 0.84 }}>{allowanceSummary}</p>
          <div className="cta-row" style={{ marginTop: 8 }}>
            {canUpgrade ? <PremiumButton href="/upgrade">Upgrade plan</PremiumButton> : null}
            <BillingPortalButton compact />
          </div>
        </div>
      </PremiumCard>

      <PremiumCard style={{ marginTop: 14 }}>
        <h3 style={{ marginTop: 0 }}>Need help with billing?</h3>
        <p style={{ marginBottom: 12 }}>Message us on WhatsApp and we will help you directly.</p>
        <a className="btn btn-secondary" href={WHATSAPP_LINK} target="_blank" rel="noopener noreferrer">
          WhatsApp: {WHATSAPP_NUMBER_DISPLAY}
        </a>
      </PremiumCard>
    </main>
  );
}

