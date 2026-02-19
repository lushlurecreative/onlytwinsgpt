import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { isAdminUser } from "@/lib/admin";
import { getServiceCreatorId } from "@/lib/service-creator";

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

  const { data: subs, error: subsError } = await supabase
    .from("subscriptions")
    .select("id, subscriber_id, status, stripe_price_id, current_period_end, created_at, canceled_at")
    .eq("creator_id", serviceCreatorId)
    .order("created_at", { ascending: false })
    .limit(2000);

  if (subsError) {
    return NextResponse.json({ error: subsError.message }, { status: 400 });
  }

  const rows = (subs ?? []) as {
    id: string;
    subscriber_id: string;
    status: string;
    stripe_price_id: string | null;
    current_period_end: string | null;
    created_at: string;
    canceled_at: string | null;
  }[];

  const subscriberIds = [...new Set(rows.map((r) => r.subscriber_id))];
  const profileMap = new Map<string, { full_name?: string | null }>();

  if (subscriberIds.length > 0) {
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, full_name")
      .in("id", subscriberIds);
    for (const p of profiles ?? []) {
      const row = p as { id: string; full_name?: string | null };
      profileMap.set(row.id, { full_name: row.full_name });
    }
  }

  const modelStatusByUser = new Map<string, string>();
  const usageByUser = new Map<string, number>();
  const lastActivityByUser = new Map<string, string>();

  if (subscriberIds.length > 0) {
    const { data: subjects } = await supabase
      .from("subjects")
      .select("id, user_id")
      .in("user_id", subscriberIds);
    const subjectIds = (subjects ?? []).map((s) => (s as { id: string }).id);
    const subjectByUserId = new Map<string, string>();
    for (const s of subjects ?? []) {
      const row = s as { id: string; user_id: string };
      subjectByUserId.set(row.user_id, row.id);
    }
    if (subjectIds.length > 0) {
      const { data: models } = await supabase
        .from("subjects_models")
        .select("subject_id, training_status")
        .in("subject_id", subjectIds);
      for (const m of models ?? []) {
        const row = m as { subject_id: string; training_status: string };
        const uid = [...subjectByUserId.entries()].find(([, sid]) => sid === row.subject_id)?.[0];
        if (uid) {
          const label =
            row.training_status === "completed"
              ? "Trained"
              : row.training_status === "training"
                ? "Training"
                : row.training_status === "failed"
                  ? "Failed"
                  : "Not Trained";
          modelStatusByUser.set(uid, label);
        }
      }
    }
    const { data: genReqs } = await supabase
      .from("generation_requests")
      .select("user_id, updated_at")
      .in("user_id", subscriberIds)
      .order("updated_at", { ascending: false });
    for (const g of genReqs ?? []) {
      const row = g as { user_id: string; updated_at: string };
      if (!usageByUser.has(row.user_id)) usageByUser.set(row.user_id, 0);
      usageByUser.set(row.user_id, (usageByUser.get(row.user_id) ?? 0) + 1);
      if (!lastActivityByUser.has(row.user_id))
        lastActivityByUser.set(row.user_id, row.updated_at);
    }
  }

  const now = Date.now();
  const oneWeekAgo = now - 7 * 24 * 60 * 60 * 1000;
  const activeStatuses = ["active", "trialing", "past_due"];

  const summary = {
    activeCustomers: rows.filter((r) => activeStatuses.includes(r.status)).length,
    newThisWeek: rows.filter((r) => new Date(r.created_at).getTime() >= oneWeekAgo).length,
    canceledThisWeek: rows.filter(
      (r) => r.canceled_at && new Date(r.canceled_at).getTime() >= oneWeekAgo
    ).length,
  };

  const list = rows.map((r) => {
    const profile = profileMap.get(r.subscriber_id);
    const displayName =
      (profile?.full_name && profile.full_name.trim()) || r.subscriber_id.slice(0, 8) + "…";
    const planLabel = r.stripe_price_id ? "Subscription" : "—";
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
    const usage = usageByUser.get(r.subscriber_id) ?? 0;
    const modelStatus = modelStatusByUser.get(r.subscriber_id) ?? "Not Trained";
    const lastActivity =
      lastActivityByUser.get(r.subscriber_id) ?? r.created_at;
    return {
      workspaceId: r.subscriber_id,
      creator: displayName,
      plan: planLabel,
      status: statusLabel,
      renewalDate: r.current_period_end,
      createdAt: r.created_at,
      canceledAt: r.canceled_at,
      usage,
      modelStatus,
      lastActivity,
    };
  });

  return NextResponse.json({ customers: list, summary }, { status: 200 });
}
