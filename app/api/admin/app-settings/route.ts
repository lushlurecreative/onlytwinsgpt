import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { isAdminUser } from "@/lib/admin";

const AUTOMATION_KEYS = [
  "lead_scrape_handles",
  "lead_sample_max_per_run",
  "lead_sample_daily_budget_usd",
  "outreach_max_attempts",
  "outreach_cron_max_per_run",
] as const;

/** GET: Return automation app_settings (keys + values). Admin only. */
export async function GET() {
  const supabase = await createClient();
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isAdminUser(user.id)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const admin = getSupabaseAdmin();
  const { data: rows } = await admin
    .from("app_settings")
    .select("key, value")
    .in("key", [...AUTOMATION_KEYS]);

  const settings: Record<string, string> = {};
  for (const k of AUTOMATION_KEYS) settings[k] = "";
  for (const r of rows ?? []) settings[(r as { key: string }).key] = (r as { value: string }).value ?? "";
  return NextResponse.json(settings);
}

/** PATCH: Update one or more automation app_settings. Admin only. */
export async function PATCH(request: Request) {
  const supabase = await createClient();
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isAdminUser(user.id)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  let body: Record<string, string> = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const admin = getSupabaseAdmin();
  const now = new Date().toISOString();
  for (const key of AUTOMATION_KEYS) {
    if (body[key] !== undefined) {
      await admin.from("app_settings").upsert(
        { key, value: String(body[key]).trim(), updated_at: now },
        { onConflict: "key" }
      );
    }
  }
  return NextResponse.json({ ok: true });
}
