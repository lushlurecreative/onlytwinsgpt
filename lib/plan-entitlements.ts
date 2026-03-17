import { PACKAGE_PLANS, PRICE_ID_ENV_BY_PLAN, type PlanKey } from "@/lib/package-plans";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

export type PlanEntitlements = {
  planKey: PlanKey;
  planName: string;
  includedImages: number;
  includedVideos: number;
  maxScenes: number;
  minSamples: number;
  maxSamples: number;
};

// These are used to drive the onboarding UI. Keep aligned with pricing page copy.
export const ENTITLEMENTS_BY_PLAN: Record<PlanKey, Omit<PlanEntitlements, "planKey">> = {
  starter: {
    planName: PACKAGE_PLANS.starter.name,
    includedImages: 45,
    includedVideos: 5,
    maxScenes: 3,
    minSamples: 10,
    maxSamples: 20,
  },
  professional: {
    planName: PACKAGE_PLANS.professional.name,
    includedImages: 90,
    includedVideos: 15,
    maxScenes: 6,
    minSamples: 10,
    maxSamples: 20,
  },
  elite: {
    planName: PACKAGE_PLANS.elite.name,
    includedImages: 200,
    includedVideos: 35,
    maxScenes: 10,
    minSamples: 10,
    maxSamples: 20,
  },
  single_batch: {
    planName: PACKAGE_PLANS.single_batch.name,
    includedImages: 45,
    includedVideos: 0,
    maxScenes: 3,
    minSamples: 10,
    maxSamples: 20,
  },
  partner_70_30: {
    planName: PACKAGE_PLANS.partner_70_30.name,
    includedImages: 45,
    includedVideos: 5,
    maxScenes: 3,
    minSamples: 10,
    maxSamples: 20,
  },
  partner_50_50: {
    planName: PACKAGE_PLANS.partner_50_50.name,
    includedImages: 90,
    includedVideos: 15,
    maxScenes: 6,
    minSamples: 10,
    maxSamples: 20,
  },
};

export function getPlanKeyForStripePriceId(priceId: string | null | undefined): PlanKey | null {
  const pid = (priceId ?? "").trim();
  if (!pid) return null;
  const keys = Object.keys(PRICE_ID_ENV_BY_PLAN) as PlanKey[];
  for (const k of keys) {
    const envName = PRICE_ID_ENV_BY_PLAN[k];
    const expected = (process.env[envName] ?? "").trim();
    if (expected && expected === pid) return k;
  }
  return null;
}

const APP_SETTINGS_KEY_TO_PLAN: Record<string, PlanKey> = {
  stripe_price_starter: "starter",
  stripe_price_professional: "professional",
  stripe_price_elite: "elite",
  stripe_price_single_batch: "single_batch",
  stripe_price_partner_70_30: "partner_70_30",
  stripe_price_partner_50_50: "partner_50_50",
};

/**
 * Loads all price ID → plan key mappings from env vars and app_settings.
 * Use this once per request, then use the returned map for lookups.
 * Needed when STRIPE_PRICE_ID_* env vars are not set in Vercel.
 */
export async function loadPriceIdPlanMap(): Promise<Map<string, PlanKey>> {
  const map = new Map<string, PlanKey>();
  const keys = Object.keys(PRICE_ID_ENV_BY_PLAN) as PlanKey[];
  for (const k of keys) {
    const envName = PRICE_ID_ENV_BY_PLAN[k];
    const priceId = (process.env[envName] ?? "").trim();
    if (priceId) map.set(priceId, k);
  }
  if (map.size < keys.length) {
    const admin = getSupabaseAdmin();
    const { data } = await admin
      .from("app_settings")
      .select("key, value")
      .in("key", Object.keys(APP_SETTINGS_KEY_TO_PLAN));
    for (const row of data ?? []) {
      const k = (row as { key?: string }).key ?? "";
      const v = ((row as { value?: string }).value ?? "").trim();
      const planKey = APP_SETTINGS_KEY_TO_PLAN[k];
      if (v && planKey && !map.has(v)) map.set(v, planKey);
    }
  }
  return map;
}

