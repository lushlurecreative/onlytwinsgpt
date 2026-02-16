import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { isAdminUser } from "@/lib/admin";

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

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isAdminUser(user.id)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const nowMs = Date.now();
  const sevenDaysMs = nowMs + 7 * 24 * 60 * 60 * 1000;

  const { data, error } = await supabase
    .from("subscriptions")
    .select(
      "id, creator_id, subscriber_id, status, current_period_end, canceled_at, created_at, stripe_subscription_id"
    )
    .in("status", ["past_due", "active", "trialing", "canceled"])
    .order("created_at", { ascending: false })
    .limit(5000);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  const rows = (data ?? []) as SubscriptionRow[];
  const highRisk = rows.filter((r) => r.status === "past_due");
  const mediumRisk = rows.filter((r) => {
    if (!r.current_period_end) return false;
    const endMs = new Date(r.current_period_end).getTime();
    return (
      Number.isFinite(endMs) &&
      endMs > nowMs &&
      endMs <= sevenDaysMs &&
      (r.status === "active" || r.status === "trialing")
    );
  });
  const lowRisk = rows.filter((r) => {
    if (!r.current_period_end) return false;
    const endMs = new Date(r.current_period_end).getTime();
    return Number.isFinite(endMs) && endMs > sevenDaysMs && r.status === "canceled";
  });

  return NextResponse.json(
    {
      summary: {
        highRisk: highRisk.length,
        mediumRisk: mediumRisk.length,
        lowRisk: lowRisk.length,
      },
      highRisk: highRisk.slice(0, 200),
      mediumRisk: mediumRisk.slice(0, 200),
    },
    { status: 200 }
  );
}

