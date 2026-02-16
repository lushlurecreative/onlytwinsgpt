import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { isAdminUser } from "@/lib/admin";

type HealthRow = {
  id: string;
  creator_id: string;
  subscriber_id: string;
  status: string;
  current_period_end: string | null;
  canceled_at: string | null;
  created_at: string;
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

  const { data, error } = await supabase
    .from("subscriptions")
    .select("id, creator_id, subscriber_id, status, current_period_end, canceled_at, created_at")
    .order("created_at", { ascending: false })
    .limit(1500);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  const rows = (data ?? []) as HealthRow[];
  const nowMs = Date.now();
  const issues = rows.filter((row) => {
    const endMs = row.current_period_end ? new Date(row.current_period_end).getTime() : null;
    const hasFutureEnd = Number.isFinite(endMs) && (endMs as number) > nowMs;
    const hasPastEnd = Number.isFinite(endMs) && (endMs as number) <= nowMs;

    if (row.status === "expired" && hasFutureEnd) return true;
    if ((row.status === "active" || row.status === "trialing") && hasPastEnd) return true;
    if (row.status === "canceled" && hasFutureEnd) return true;
    return false;
  });

  const summary = {
    totalRows: rows.length,
    issueRows: issues.length,
    expiredWithFutureEnd: issues.filter((r) => {
      const endMs = r.current_period_end ? new Date(r.current_period_end).getTime() : null;
      return r.status === "expired" && Number.isFinite(endMs) && (endMs as number) > nowMs;
    }).length,
    activeOrTrialingPastEnd: issues.filter((r) => {
      const endMs = r.current_period_end ? new Date(r.current_period_end).getTime() : null;
      return (
        (r.status === "active" || r.status === "trialing") &&
        Number.isFinite(endMs) &&
        (endMs as number) <= nowMs
      );
    }).length,
    canceledWithFutureEnd: issues.filter((r) => {
      const endMs = r.current_period_end ? new Date(r.current_period_end).getTime() : null;
      return r.status === "canceled" && Number.isFinite(endMs) && (endMs as number) > nowMs;
    }).length,
  };

  return NextResponse.json({ summary, issues: issues.slice(0, 250) }, { status: 200 });
}

