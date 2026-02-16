import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { getServiceCreatorId } from "@/lib/service-creator";
import { ENTITLEMENTS_BY_PLAN, getPlanKeyForStripePriceId } from "@/lib/plan-entitlements";

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
  const serviceCreatorId = getServiceCreatorId();

  const { data, error } = await admin
    .from("subscriptions")
    .select("id, status, stripe_price_id, current_period_end, canceled_at, created_at")
    .eq("subscriber_id", user.id)
    .eq("creator_id", serviceCreatorId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  const planKey = getPlanKeyForStripePriceId(data?.stripe_price_id ?? null);
  if (!planKey) {
    return NextResponse.json(
      {
        entitlements: null,
        subscription: data ?? null,
        error:
          "No plan entitlements found. If you just purchased, wait 1-2 minutes for Stripe webhook to sync.",
      },
      { status: 200 }
    );
  }

  const base = ENTITLEMENTS_BY_PLAN[planKey];
  return NextResponse.json(
    {
      entitlements: { planKey, ...base },
      subscription: data ?? null,
    },
    { status: 200 }
  );
}

