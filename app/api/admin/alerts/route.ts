import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { isAdminUser } from "@/lib/admin";

type SubscriptionRow = {
  id: string;
  status: string;
  current_period_end: string | null;
  canceled_at: string | null;
};

type WebhookRow = {
  id: string;
  event_type: string;
  received_at: string;
  processed_at: string | null;
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
  const soonMs = nowMs + 3 * 24 * 60 * 60 * 1000;

  const [{ data: subs, error: subsError }, { data: hookRows, error: hookError }] = await Promise.all([
    supabase
      .from("subscriptions")
      .select("id, status, current_period_end, canceled_at")
      .in("status", ["active", "trialing", "past_due", "canceled", "expired"])
      .limit(5000),
    supabase
      .from("stripe_webhook_events")
      .select("id, event_type, received_at, processed_at")
      .order("received_at", { ascending: false })
      .limit(2000),
  ]);

  if (subsError) {
    return NextResponse.json({ error: subsError.message }, { status: 400 });
  }

  const webhookTableMissing = (hookError as { code?: string } | null)?.code === "42P01";
  if (hookError && !webhookTableMissing) {
    return NextResponse.json({ error: hookError.message }, { status: 400 });
  }

  const subscriptions = (subs ?? []) as SubscriptionRow[];
  const expiringSoon = subscriptions.filter((s) => {
    const endMs = s.current_period_end ? new Date(s.current_period_end).getTime() : NaN;
    return (
      Number.isFinite(endMs) &&
      endMs > nowMs &&
      endMs <= soonMs &&
      ["active", "trialing", "past_due"].includes(s.status)
    );
  }).length;
  const pastDue = subscriptions.filter((s) => s.status === "past_due").length;
  const canceledStillActiveWindow = subscriptions.filter((s) => {
    const endMs = s.current_period_end ? new Date(s.current_period_end).getTime() : NaN;
    return s.status === "canceled" && Number.isFinite(endMs) && endMs > nowMs;
  }).length;

  const hooks = (hookRows ?? []) as WebhookRow[];
  const staleWebhookPending = hooks.filter((h) => {
    if (h.processed_at) return false;
    return nowMs - new Date(h.received_at).getTime() > 10 * 60 * 1000;
  }).length;

  const alerts = [
    {
      key: "stale_webhook_pending",
      severity: staleWebhookPending > 0 ? "high" : "ok",
      value: staleWebhookPending,
      description: "Webhook events pending over 10 minutes",
    },
    {
      key: "past_due_subscriptions",
      severity: pastDue > 0 ? "medium" : "ok",
      value: pastDue,
      description: "Subscriptions currently in past_due state",
    },
    {
      key: "expiring_within_3_days",
      severity: expiringSoon > 0 ? "medium" : "ok",
      value: expiringSoon,
      description: "Active-like subscriptions expiring in next 3 days",
    },
    {
      key: "canceled_with_future_access",
      severity: canceledStillActiveWindow > 0 ? "low" : "ok",
      value: canceledStillActiveWindow,
      description: "Canceled subscriptions still within paid access window",
    },
  ];

  return NextResponse.json(
    {
      generatedAt: new Date().toISOString(),
      webhookTableMissing,
      alerts,
    },
    { status: 200 }
  );
}

