import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { isAdminUser } from "@/lib/admin";

/** GET: GPU usage summary and lead_sample budget. Admin only. */
export async function GET(request: Request) {
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

  const admin = getSupabaseAdmin();
  const { searchParams } = new URL(request.url);
  const days = Math.min(90, Math.max(1, parseInt(searchParams.get("days") ?? "30", 10) || 30));
  const since = new Date();
  since.setDate(since.getDate() - days);
  const sinceIso = since.toISOString();

  const [
    { data: rows },
    { data: budgetRow },
  ] = await Promise.all([
    admin
      .from("gpu_usage")
      .select("job_type, duration_sec, cost_usd, created_at")
      .gte("created_at", sinceIso)
      .order("created_at", { ascending: false }),
    admin.from("app_settings").select("value").eq("key", "lead_sample_daily_budget_usd").maybeSingle(),
  ]);

  const byType: Record<string, { count: number; duration_sec: number; cost_usd: number }> = {};
  for (const row of rows ?? []) {
    const r = row as { job_type: string; duration_sec: number; cost_usd?: number | null };
    const t = r.job_type || "unknown";
    if (!byType[t]) byType[t] = { count: 0, duration_sec: 0, cost_usd: 0 };
    byType[t].count += 1;
    byType[t].duration_sec += Number(r.duration_sec) || 0;
    byType[t].cost_usd += Number(r.cost_usd) || 0;
  }

  const todayStart = new Date();
  todayStart.setUTCHours(0, 0, 0, 0);
  const leadSampleToday = (rows ?? []).filter(
    (r) => (r as { job_type: string }).job_type === "lead_sample" && new Date((r as { created_at: string }).created_at) >= todayStart
  );
  const spentToday = leadSampleToday.reduce(
    (s, r) => s + (Number((r as { cost_usd?: number | null }).cost_usd) || 0),
    0
  );
  const dailyBudgetUsd = parseFloat(String(budgetRow?.value ?? "0")) || 0;

  return NextResponse.json({
    days,
    by_type: byType,
    lead_sample_today_count: leadSampleToday.length,
    lead_sample_spent_today_usd: spentToday,
    lead_sample_daily_budget_usd: dailyBudgetUsd,
    recent: (rows ?? []).slice(0, 50),
  });
}
