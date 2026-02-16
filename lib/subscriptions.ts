import type { SupabaseClient } from "@supabase/supabase-js";

export async function hasActiveSubscription(
  supabase: SupabaseClient,
  subscriberId: string,
  creatorId: string
) {
  if (!subscriberId || !creatorId || subscriberId === creatorId) {
    return subscriberId === creatorId;
  }

  const { data, error } = await supabase
    .from("subscriptions")
    .select("id, status, current_period_end, canceled_at")
    .eq("subscriber_id", subscriberId)
    .eq("creator_id", creatorId)
    .in("status", ["active", "trialing", "past_due"])
    .limit(10);

  if (error) {
    return false;
  }

  const nowMs = Date.now();
  const pastDueGraceMs = 3 * 24 * 60 * 60 * 1000;
  return (data ?? []).some((row) => {
    if (!row.current_period_end) {
      return row.status === "active" || row.status === "trialing";
    }

    const endMs = new Date(row.current_period_end).getTime();
    if (!Number.isFinite(endMs)) return false;

    if (row.status === "active" || row.status === "trialing") {
      return endMs > nowMs;
    }

    if (row.status === "past_due") {
      return endMs + pastDueGraceMs > nowMs;
    }

    return false;
  });
}

