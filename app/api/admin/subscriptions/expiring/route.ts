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
};

export async function GET(request: Request) {
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

  const url = new URL(request.url);
  const withinDays = Math.max(1, Math.min(30, Number(url.searchParams.get("days") ?? "7")));
  const nowMs = Date.now();
  const cutoffMs = nowMs + withinDays * 24 * 60 * 60 * 1000;

  const admin = getSupabaseAdmin();
  const { data, error } = await admin
    .from("subscriptions")
    .select(
      "id, creator_id, subscriber_id, status, current_period_end, canceled_at, created_at, stripe_subscription_id"
    )
    .in("status", ["active", "trialing", "past_due"])
    .not("current_period_end", "is", null)
    .order("current_period_end", { ascending: true })
    .limit(3000);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  const expiring = ((data ?? []) as SubscriptionRow[]).filter((row) => {
    const endMs = row.current_period_end ? new Date(row.current_period_end).getTime() : NaN;
    return Number.isFinite(endMs) && endMs > nowMs && endMs <= cutoffMs;
  });

  return NextResponse.json(
    {
      withinDays,
      count: expiring.length,
      rows: expiring.slice(0, 300),
    },
    { status: 200 }
  );
}

