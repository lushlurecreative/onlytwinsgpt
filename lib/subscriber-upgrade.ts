import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { getServiceCreatorId } from "@/lib/service-creator";
import { PACKAGE_PLANS, PRICE_ID_ENV_BY_PLAN, type PlanKey } from "@/lib/package-plans";
import { getPlanKeyForStripePriceId } from "@/lib/plan-entitlements";

const PLAN_RANK: Record<PlanKey, number> = {
  single_batch: 0,
  partner_50_50: 0,
  partner_70_30: 0,
  starter: 1,
  professional: 2,
  elite: 3,
};

export function isUpgradePath(currentPlan: PlanKey | null, targetPlan: PlanKey) {
  if (!currentPlan) return false;
  return PLAN_RANK[targetPlan] > PLAN_RANK[currentPlan];
}

export async function getCurrentSubscriberPlan(userId: string) {
  const admin = getSupabaseAdmin();
  const serviceCreatorId = getServiceCreatorId();
  const { data } = await admin
    .from("subscriptions")
    .select("stripe_subscription_id, stripe_price_id, status, created_at")
    .eq("subscriber_id", userId)
    .eq("creator_id", serviceCreatorId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const row = data as {
    stripe_subscription_id?: string | null;
    stripe_price_id?: string | null;
    status?: string | null;
  } | null;
  return {
    stripeSubscriptionId: row?.stripe_subscription_id ?? null,
    stripePriceId: row?.stripe_price_id ?? null,
    status: row?.status ?? null,
    currentPlanKey: getPlanKeyForStripePriceId(row?.stripe_price_id ?? null),
  };
}

export function resolveTargetPriceId(targetPlan: PlanKey) {
  const envKey = PRICE_ID_ENV_BY_PLAN[targetPlan];
  const priceId = (process.env[envKey] ?? "").trim();
  if (!priceId) {
    throw new Error(`Missing Stripe price id for ${targetPlan}. Expected env var ${envKey}.`);
  }
  return priceId;
}

export function getUpgradeablePlans(currentPlanKey: PlanKey | null) {
  const ordered: PlanKey[] = ["starter", "professional", "elite"];
  return ordered.filter((plan) => isUpgradePath(currentPlanKey, plan)).map((plan) => ({
    key: plan,
    name: PACKAGE_PLANS[plan].name,
    amountUsd: PACKAGE_PLANS[plan].amountUsd,
    displayPrice: PACKAGE_PLANS[plan].displayPrice,
  }));
}

