import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { isAdminUser } from "@/lib/admin";

type RevenueRow = {
  id: string;
  creator_id: string;
  status: string;
  stripe_price_id: string | null;
  created_at: string;
  current_period_end: string | null;
};

function monthKey(dateIso: string) {
  const d = new Date(dateIso);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function estimatePlanAmount(priceId: string | null) {
  // Placeholder pricing map until full Stripe price sync is added.
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

  const { data, error } = await supabase
    .from("subscriptions")
    .select("id, creator_id, status, stripe_price_id, created_at, current_period_end")
    .order("created_at", { ascending: false })
    .limit(5000);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  const rows = (data ?? []) as RevenueRow[];
  const activeLike = rows.filter((r) => ["active", "trialing", "past_due"].includes(r.status));
  const estMrr = activeLike.reduce((sum, row) => sum + estimatePlanAmount(row.stripe_price_id), 0);

  const byCreator = new Map<string, { subs: number; mrr: number }>();
  for (const row of activeLike) {
    const entry = byCreator.get(row.creator_id) ?? { subs: 0, mrr: 0 };
    entry.subs += 1;
    entry.mrr += estimatePlanAmount(row.stripe_price_id);
    byCreator.set(row.creator_id, entry);
  }
  const topCreators = [...byCreator.entries()]
    .map(([creatorId, v]) => ({ creatorId, subscribers: v.subs, estMrr: Number(v.mrr.toFixed(2)) }))
    .sort((a, b) => b.estMrr - a.estMrr)
    .slice(0, 20);

  const byMonth = new Map<string, { started: number; activeNow: number }>();
  const nowMs = Date.now();
  for (const row of rows) {
    const key = monthKey(row.created_at);
    const entry = byMonth.get(key) ?? { started: 0, activeNow: 0 };
    entry.started += 1;
    const endMs = row.current_period_end ? new Date(row.current_period_end).getTime() : null;
    const activeNow =
      ["active", "trialing", "past_due"].includes(row.status) &&
      (endMs === null || (Number.isFinite(endMs) && endMs > nowMs));
    if (activeNow) entry.activeNow += 1;
    byMonth.set(key, entry);
  }
  const monthly = [...byMonth.entries()]
    .map(([month, v]) => ({
      month,
      started: v.started,
      activeNow: v.activeNow,
      retainedPct: v.started > 0 ? Math.round((v.activeNow / v.started) * 100) : 0,
    }))
    .sort((a, b) => b.month.localeCompare(a.month))
    .slice(0, 12);

  return NextResponse.json(
    {
      summary: {
        activeLikeCount: activeLike.length,
        estMrr: Number(estMrr.toFixed(2)),
      },
      topCreators,
      monthly,
    },
    { status: 200 }
  );
}

