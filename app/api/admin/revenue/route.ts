import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { isAdminUser } from "@/lib/admin";
import { getServiceCreatorId } from "@/lib/service-creator";

type RevenueRow = {
  id: string;
  creator_id: string;
  subscriber_id: string;
  status: string;
  stripe_price_id: string | null;
  created_at: string;
  current_period_end: string | null;
  canceled_at: string | null;
};

function monthKey(dateIso: string) {
  const d = new Date(dateIso);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function estimatePlanAmount(priceId: string | null) {
  if (!priceId) return 9.99;
  return 9.99;
}

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

  const serviceCreatorId = getServiceCreatorId();
  const { data, error } = await supabase
    .from("subscriptions")
    .select("id, creator_id, subscriber_id, status, stripe_price_id, created_at, current_period_end, canceled_at")
    .eq("creator_id", serviceCreatorId)
    .order("created_at", { ascending: false })
    .limit(5000);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  const rows = (data ?? []) as RevenueRow[];
  const activeLike = rows.filter((r) => ["active", "trialing", "past_due"].includes(r.status));
  const estMrr = activeLike.reduce((sum, row) => sum + estimatePlanAmount(row.stripe_price_id), 0);

  const now = new Date();
  const thisMonthKey = monthKey(now.toISOString());
  const newThisMonth = rows.filter((r) => monthKey(r.created_at) === thisMonthKey).length;
  const canceledThisMonth = rows.filter(
    (r) => r.canceled_at && monthKey(r.canceled_at) === thisMonthKey
  ).length;
  const revenueThisMonth = Number(estMrr.toFixed(2));

  const subscriberIds = [...new Set(rows.map((r) => r.subscriber_id))];
  const profileMap = new Map<string, string>();
  if (subscriberIds.length > 0) {
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, full_name")
      .in("id", subscriberIds);
    for (const p of profiles ?? []) {
      const row = p as { id: string; full_name?: string | null };
      profileMap.set(row.id, (row.full_name && row.full_name.trim()) || row.id.slice(0, 8) + "…");
    }
  }

  const subscriptionList = rows.map((r) => {
    const statusLabel =
      r.status === "trialing"
        ? "Trial"
        : r.status === "active"
          ? "Active"
          : r.status === "past_due"
            ? "Past Due"
            : r.status === "canceled"
              ? "Canceled"
              : r.status === "expired"
                ? "Expired"
                : r.status;
    return {
      creator: profileMap.get(r.subscriber_id) ?? r.subscriber_id.slice(0, 8) + "…",
      plan: r.stripe_price_id ? "Subscription" : "—",
      status: statusLabel,
      renewalDate: r.current_period_end
        ? new Date(r.current_period_end).toLocaleDateString()
        : "—",
    };
  });

  return NextResponse.json(
    {
      summary: {
        activeSubscribers: activeLike.length,
        revenueThisMonth,
        newThisMonth,
        canceledThisMonth,
      },
      subscriptionList,
    },
    { status: 200 }
  );
}

