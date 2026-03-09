import { ENTITLEMENTS_BY_PLAN, getPlanKeyForStripePriceId } from "@/lib/plan-entitlements";
import { getServiceCreatorId } from "@/lib/service-creator";
import type { SupabaseClient } from "@supabase/supabase-js";

export type MixLine = {
  id: string;
  type: "photo" | "video";
  quantity: number;
  prompt: string;
};

export type SavedRecurringMix = {
  updatedAt: string;
  appliesTo: "next_cycle" | "following_cycle";
  cutoffAt: string | null;
  nextRenewalAt: string | null;
  cycleEffectiveAt: string | null;
  lines: MixLine[];
};

const CUT_OFF_DAYS = 5;

export function normalizeMixLines(input: unknown): MixLine[] {
  if (!Array.isArray(input)) return [];
  const lines: MixLine[] = [];
  for (const raw of input) {
    if (!raw || typeof raw !== "object") continue;
    const row = raw as {
      id?: unknown;
      type?: unknown;
      kind?: unknown;
      quantity?: unknown;
      count?: unknown;
      prompt?: unknown;
      direction?: unknown;
    };
    const typeRaw = String(row.type ?? row.kind ?? "").toLowerCase();
    const type = typeRaw === "video" ? "video" : typeRaw === "photo" ? "photo" : null;
    const quantityNum = Number(row.quantity ?? row.count ?? 0);
    const quantity = Number.isFinite(quantityNum) ? Math.max(1, Math.min(500, Math.floor(quantityNum))) : 0;
    const prompt = String(row.prompt ?? row.direction ?? "").trim();
    if (!type || quantity < 1 || !prompt) continue;
    lines.push({
      id: String(row.id ?? crypto.randomUUID()),
      type,
      quantity,
      prompt,
    });
  }
  return lines;
}

export function computeCutoff(
  nextRenewalAtIso: string | null,
  now: Date = new Date()
): { cutoffAt: string | null; appliesTo: "next_cycle" | "following_cycle" } {
  if (!nextRenewalAtIso) {
    return {
      cutoffAt: null as string | null,
      appliesTo: "next_cycle" as const,
    };
  }
  const renewal = new Date(nextRenewalAtIso);
  const cutoff = new Date(renewal.getTime() - CUT_OFF_DAYS * 24 * 60 * 60 * 1000);
  const appliesTo = now.getTime() <= cutoff.getTime() ? "next_cycle" : "following_cycle";
  return {
    cutoffAt: cutoff.toISOString(),
    appliesTo,
  };
}

export async function getCurrentSubscriptionSummary(
  admin: SupabaseClient,
  userId: string
): Promise<{
  planKey: string | null;
  planName: string;
  includedImages: number;
  includedVideos: number;
  stripeSubscriptionId: string | null;
  nextRenewalAt: string | null;
  status: string;
}> {
  const serviceCreatorId = getServiceCreatorId();
  const { data: row } = await admin
    .from("subscriptions")
    .select("status, stripe_price_id, stripe_subscription_id, current_period_end, created_at")
    .eq("subscriber_id", userId)
    .eq("creator_id", serviceCreatorId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const planKey = getPlanKeyForStripePriceId((row as { stripe_price_id?: string | null } | null)?.stripe_price_id ?? null);
  const base =
    planKey && planKey in ENTITLEMENTS_BY_PLAN
      ? ENTITLEMENTS_BY_PLAN[planKey as keyof typeof ENTITLEMENTS_BY_PLAN]
      : null;

  return {
    planKey,
    planName: base?.planName ?? "Current package",
    includedImages: base?.includedImages ?? 45,
    includedVideos: base?.includedVideos ?? 5,
    stripeSubscriptionId: (row as { stripe_subscription_id?: string | null } | null)?.stripe_subscription_id ?? null,
    nextRenewalAt: (row as { current_period_end?: string | null } | null)?.current_period_end ?? null,
    status: (row as { status?: string | null } | null)?.status ?? "unknown",
  };
}

