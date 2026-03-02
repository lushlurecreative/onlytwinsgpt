import type { SupabaseClient } from "@supabase/supabase-js";
import { ENTITLEMENTS_BY_PLAN, getPlanKeyForStripePriceId } from "@/lib/plan-entitlements";
import { type PlanKey } from "@/lib/package-plans";
import { getServiceCreatorId } from "@/lib/service-creator";

export const PLAN_LIMITS: Record<PlanKey, { imageLimit: number; videoLimit: number }> = {
  starter: { imageLimit: ENTITLEMENTS_BY_PLAN.starter.includedImages, videoLimit: ENTITLEMENTS_BY_PLAN.starter.includedVideos },
  professional: { imageLimit: ENTITLEMENTS_BY_PLAN.professional.includedImages, videoLimit: ENTITLEMENTS_BY_PLAN.professional.includedVideos },
  elite: { imageLimit: ENTITLEMENTS_BY_PLAN.elite.includedImages, videoLimit: ENTITLEMENTS_BY_PLAN.elite.includedVideos },
  single_batch: { imageLimit: ENTITLEMENTS_BY_PLAN.single_batch.includedImages, videoLimit: ENTITLEMENTS_BY_PLAN.single_batch.includedVideos },
  partner_70_30: { imageLimit: ENTITLEMENTS_BY_PLAN.partner_70_30.includedImages, videoLimit: ENTITLEMENTS_BY_PLAN.partner_70_30.includedVideos },
  partner_50_50: { imageLimit: ENTITLEMENTS_BY_PLAN.partner_50_50.includedImages, videoLimit: ENTITLEMENTS_BY_PLAN.partner_50_50.includedVideos },
};

export type UsageContext = {
  subscriptionStatus: string;
  planKey: PlanKey;
  imageLimit: number;
  videoLimit: number;
  periodStartIso: string;
  periodEndIso: string;
};

export function isGenerationEligibleSubscriptionStatus(status: string) {
  return status === "active" || status === "trialing" || status === "past_due";
}

async function resolvePlanKeyFromAppSettings(
  admin: SupabaseClient,
  stripePriceId: string
): Promise<PlanKey | null> {
  const { data: rows } = await admin
    .from("app_settings")
    .select("key, value")
    .in("key", [
      "stripe_price_starter",
      "stripe_price_professional",
      "stripe_price_elite",
      "stripe_price_single_batch",
      "stripe_price_partner_70_30",
      "stripe_price_partner_50_50",
    ]);
  const normalized = stripePriceId.trim();
  const keyMap: Record<string, PlanKey> = {
    stripe_price_starter: "starter",
    stripe_price_professional: "professional",
    stripe_price_elite: "elite",
    stripe_price_single_batch: "single_batch",
    stripe_price_partner_70_30: "partner_70_30",
    stripe_price_partner_50_50: "partner_50_50",
  };
  for (const row of rows ?? []) {
    const key = (row as { key?: string }).key ?? "";
    const value = ((row as { value?: string }).value ?? "").trim();
    if (value && value === normalized && keyMap[key]) return keyMap[key];
  }
  return null;
}

export async function resolveUsageContext(
  admin: SupabaseClient,
  userId: string
): Promise<UsageContext | null> {
  const serviceCreatorId = getServiceCreatorId();
  const { data } = await admin
    .from("subscriptions")
    .select("status, stripe_price_id, current_period_end, created_at")
    .eq("subscriber_id", userId)
    .eq("creator_id", serviceCreatorId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const row = data as
    | {
        status?: string | null;
        stripe_price_id?: string | null;
        current_period_end?: string | null;
        created_at?: string | null;
      }
    | null;
  if (!row?.status) return null;

  let planKey = getPlanKeyForStripePriceId(row.stripe_price_id ?? null);
  if (!planKey && row.stripe_price_id) {
    planKey = await resolvePlanKeyFromAppSettings(admin, row.stripe_price_id);
  }
  if (!planKey) return null;

  const now = new Date();
  const periodEnd = row.current_period_end ? new Date(row.current_period_end) : new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  const periodStart = new Date(periodEnd.getTime() - 30 * 24 * 60 * 60 * 1000);
  return {
    subscriptionStatus: row.status,
    planKey,
    imageLimit: PLAN_LIMITS[planKey].imageLimit,
    videoLimit: PLAN_LIMITS[planKey].videoLimit,
    periodStartIso: periodStart.toISOString(),
    periodEndIso: periodEnd.toISOString(),
  };
}
