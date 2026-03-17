import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { ENTITLEMENTS_BY_PLAN, loadPriceIdPlanMap } from "@/lib/plan-entitlements";
import type { PlanKey } from "@/lib/package-plans";

export async function GET() {
  const session = await createClient();
  const {
    data: { user },
    error: userError,
  } = await session.auth.getUser();

  if (userError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = getSupabaseAdmin();
  const [{ data, error }, priceMap] = await Promise.all([
    admin
      .from("subscriptions")
      .select("id, status, stripe_price_id, current_period_end, canceled_at, created_at, creator_id")
      .eq("subscriber_id", user.id)
      .order("created_at", { ascending: false })
      .limit(50),
    loadPriceIdPlanMap(),
  ]);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  const rows = (data ?? []) as Array<{
    id?: string;
    status?: string | null;
    stripe_price_id?: string | null;
    current_period_end?: string | null;
    canceled_at?: string | null;
    created_at?: string;
    creator_id?: string | null;
  }>;

  function resolvePlanKey(priceId: string | null | undefined): PlanKey | null {
    const pid = (priceId ?? "").trim();
    return pid ? (priceMap.get(pid) ?? null) : null;
  }

  const preferred =
    rows.find((row) => {
      const status = (row.status ?? "").toLowerCase();
      return (status === "active" || status === "trialing") && !!resolvePlanKey(row.stripe_price_id);
    }) ??
    rows.find((row) => {
      const status = (row.status ?? "").toLowerCase();
      return status === "active" || status === "trialing";
    }) ??
    rows.find((row) => !!resolvePlanKey(row.stripe_price_id)) ??
    rows[0] ??
    null;

  const { data: profile } = await admin
    .from("profiles")
    .select("stripe_customer_id, subscription_status")
    .eq("id", user.id)
    .maybeSingle();
  const profileRow = (profile ?? null) as { stripe_customer_id?: string | null; subscription_status?: string | null } | null;
  const paidAccount =
    rows.length > 0 ||
    !!profileRow?.stripe_customer_id ||
    ["active", "trialing", "past_due", "canceled"].includes(String(profileRow?.subscription_status ?? "").toLowerCase());

  const planKey = resolvePlanKey(preferred?.stripe_price_id);
  if (!planKey) {
    return NextResponse.json(
      {
        entitlements: null,
        subscription: preferred ?? null,
        paidAccount,
      },
      { status: 200 }
    );
  }

  const base = ENTITLEMENTS_BY_PLAN[planKey];
  return NextResponse.json(
    {
      entitlements: { planKey, ...base },
      subscription: preferred ?? null,
      paidAccount,
    },
    { status: 200 }
  );
}

