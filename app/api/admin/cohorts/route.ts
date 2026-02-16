import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { isAdminUser } from "@/lib/admin";

type CohortRow = {
  month: string;
  started: number;
  retainedNow: number;
  retentionRate: number;
};

function toMonthKey(dateIso: string) {
  const d = new Date(dateIso);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
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
    .select("id, status, current_period_end, created_at")
    .order("created_at", { ascending: false })
    .limit(5000);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  const rows = data ?? [];
  const nowMs = Date.now();
  const grouped = new Map<string, { started: number; retainedNow: number }>();

  for (const row of rows) {
    const month = toMonthKey(row.created_at);
    const entry = grouped.get(month) ?? { started: 0, retainedNow: 0 };
    entry.started += 1;

    const endMs = row.current_period_end ? new Date(row.current_period_end).getTime() : null;
    const isRetained =
      (row.status === "active" || row.status === "trialing" || row.status === "past_due") &&
      (endMs === null || (Number.isFinite(endMs) && endMs > nowMs));
    if (isRetained) entry.retainedNow += 1;

    grouped.set(month, entry);
  }

  const cohorts: CohortRow[] = [...grouped.entries()]
    .map(([month, value]) => ({
      month,
      started: value.started,
      retainedNow: value.retainedNow,
      retentionRate: value.started > 0 ? Math.round((value.retainedNow / value.started) * 100) : 0,
    }))
    .sort((a, b) => b.month.localeCompare(a.month))
    .slice(0, 12);

  return NextResponse.json({ cohorts }, { status: 200 });
}

