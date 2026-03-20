import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase-server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { getCurrentSubscriptionSummary } from "@/lib/request-planner";
import { WHATSAPP_LINK, WHATSAPP_NUMBER_DISPLAY } from "@/lib/support";
import BillingClient from "./BillingClient";

export const dynamic = "force-dynamic";

function planDisplayName(planKey: string | null, fallback: string): string {
  if (planKey === "starter") return "Starter";
  if (planKey === "professional") return "Growth";
  if (planKey === "elite") return "Scale";
  return fallback;
}

export default async function BillingPage() {
  const supabase = await createClient();
  const admin = getSupabaseAdmin();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?redirectTo=/billing");
  }

  const summary = await getCurrentSubscriptionSummary(admin, user.id);
  const planName = planDisplayName(summary.planKey, summary.planName);
  const allowanceSummary = `${summary.includedImages} photos + ${summary.includedVideos} videos / month`;
  const renewalLabel = summary.nextRenewalAt
    ? new Date(summary.nextRenewalAt).toLocaleDateString("en-US", {
        month: "long",
        day: "numeric",
        year: "numeric",
      })
    : "Renewal date unavailable";
  const canUpgrade =
    summary.planKey === "starter" || summary.planKey === "professional";

  return (
    <main style={{ padding: "32px 24px", maxWidth: 780, margin: "0 auto" }}>
      <BillingClient
        planName={planName}
        planKey={summary.planKey}
        status={summary.status}
        renewalLabel={renewalLabel}
        allowanceSummary={allowanceSummary}
        canUpgrade={canUpgrade}
        whatsappLink={WHATSAPP_LINK}
        whatsappDisplay={WHATSAPP_NUMBER_DISPLAY}
      />
    </main>
  );
}
