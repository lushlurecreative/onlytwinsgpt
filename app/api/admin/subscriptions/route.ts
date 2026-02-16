import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { isAdminUser } from "@/lib/admin";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

type SubscriptionRow = {
  id: string;
  creator_id: string;
  subscriber_id: string;
  status: string;
  current_period_end: string | null;
  canceled_at: string | null;
  created_at: string;
  stripe_subscription_id: string | null;
  stripe_price_id: string | null;
};

export async function GET() {
  const session = await createClient();
  const {
    data: { user },
    error: userError,
  } = await session.auth.getUser();

  if (userError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isAdminUser(user.id)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const admin = getSupabaseAdmin();
  const { data, error } = await admin
    .from("subscriptions")
    .select(
      "id, creator_id, subscriber_id, status, current_period_end, canceled_at, created_at, stripe_subscription_id, stripe_price_id"
    )
    .order("created_at", { ascending: false })
    .limit(200);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  const rows = (data ?? []) as SubscriptionRow[];
  const summary = {
    total: rows.length,
    active: rows.filter((r) => r.status === "active").length,
    trialing: rows.filter((r) => r.status === "trialing").length,
    past_due: rows.filter((r) => r.status === "past_due").length,
    canceled: rows.filter((r) => r.status === "canceled").length,
    expired: rows.filter((r) => r.status === "expired").length,
  };

  return NextResponse.json({ subscriptions: rows, summary }, { status: 200 });
}

