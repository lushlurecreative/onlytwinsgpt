import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase-server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import PremiumCard from "@/components/PremiumCard";
import PremiumButton from "@/components/PremiumButton";
import { getCurrentSubscriptionSummary } from "@/lib/request-planner";
import { WHATSAPP_LINK, WHATSAPP_NUMBER_DISPLAY } from "@/lib/support";

function statusLabel(status: string) {
  const s = status.toLowerCase();
  if (s === "active") return "Active";
  if (s === "trialing") return "Trialing";
  if (s === "past_due") return "Past due";
  if (s === "canceled") return "Canceled";
  return "Unknown";
}

export default async function MePage() {
  const supabase = await createClient();
  const admin = getSupabaseAdmin();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?redirectTo=/me");

  const summary = await getCurrentSubscriptionSummary(admin, user.id);
  const renewalLabel = summary.nextRenewalAt
    ? new Date(summary.nextRenewalAt).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : "Unavailable";
  const memberSince = user.created_at
    ? new Date(user.created_at).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : "Unavailable";
  const loginMethod = (user.app_metadata?.provider as string | undefined) ?? "email";
  const planName =
    summary.planKey === "starter"
      ? "Starter"
      : summary.planKey === "professional"
        ? "Growth"
        : summary.planKey === "elite"
          ? "Scale"
          : summary.planName || "No active plan";
  const allowanceSummary = `Includes ${summary.includedImages} photos and ${summary.includedVideos} videos per month`;

  return (
    <main style={{ padding: 24, maxWidth: 980, margin: "0 auto" }}>
      <PremiumCard>
        <h1 style={{ marginTop: 0 }}>Account</h1>
        <p style={{ marginBottom: 6 }}>
          <strong>Email:</strong> {user.email ?? "Unavailable"}
        </p>
        <p style={{ marginBottom: 6 }}>
          <strong>Current plan:</strong> {planName}
        </p>
        <p style={{ marginBottom: 6 }}>
          <strong>Renewal date:</strong> {renewalLabel}
        </p>
        <p style={{ marginBottom: 6 }}>
          <strong>Account status:</strong> {statusLabel(summary.status)}
        </p>
        <p style={{ marginBottom: 0 }}>{allowanceSummary}</p>
      </PremiumCard>

      <PremiumCard style={{ marginTop: 14 }}>
        <h2 style={{ marginTop: 0 }}>Quick links</h2>
        <div className="cta-row">
          <PremiumButton href="/dashboard">Dashboard</PremiumButton>
          <PremiumButton href="/requests" variant="secondary">Requests</PremiumButton>
          <PremiumButton href="/billing" variant="secondary">Billing</PremiumButton>
          <PremiumButton href="/library" variant="secondary">Library</PremiumButton>
        </div>
      </PremiumCard>

      <PremiumCard style={{ marginTop: 14 }}>
        <h2 style={{ marginTop: 0 }}>Support</h2>
        <p>Need help? Message us on WhatsApp.</p>
        <a className="btn btn-primary" href={WHATSAPP_LINK} target="_blank" rel="noopener noreferrer">
          WhatsApp: {WHATSAPP_NUMBER_DISPLAY}
        </a>
      </PremiumCard>

      <PremiumCard style={{ marginTop: 14 }}>
        <h2 style={{ marginTop: 0 }}>Account details</h2>
        <p style={{ marginBottom: 6 }}>
          <strong>Login method:</strong> {loginMethod}
        </p>
        <p style={{ marginBottom: 0 }}>
          <strong>Member since:</strong> {memberSince}
        </p>
      </PremiumCard>
    </main>
  );
}
