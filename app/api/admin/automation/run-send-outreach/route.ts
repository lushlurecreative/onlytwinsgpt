import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { isAdminUser } from "@/lib/admin";
import { sendOutreach, type LeadForOutreach } from "@/lib/outreach";

const DEFAULT_MAX_ATTEMPTS = 3;
const DEFAULT_MAX_PER_RUN = 20;

/** POST: Admin trigger for send outreach (same as cron). */
export async function POST() {
  const supabase = await createClient();
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isAdminUser(user.id)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const admin = getSupabaseAdmin();
  const [
    { data: maxAttemptsRow },
    { data: maxPerRunRow },
  ] = await Promise.all([
    admin.from("app_settings").select("value").eq("key", "outreach_max_attempts").maybeSingle(),
    admin.from("app_settings").select("value").eq("key", "outreach_cron_max_per_run").maybeSingle(),
  ]);
  const maxAttempts = Math.max(1, parseInt(String(maxAttemptsRow?.value ?? DEFAULT_MAX_ATTEMPTS), 10) || DEFAULT_MAX_ATTEMPTS);
  const maxPerRun = Math.max(1, parseInt(String(maxPerRunRow?.value ?? DEFAULT_MAX_PER_RUN), 10) || DEFAULT_MAX_PER_RUN);

  const { data: leads } = await admin
    .from("leads")
    .select("id, handle, platform, sample_preview_path, sample_asset_path, notes, outreach_attempts")
    .eq("status", "sample_done")
    .lt("outreach_attempts", maxAttempts)
    .order("outreach_last_sent_at", { ascending: true, nullsFirst: true })
    .limit(maxPerRun);

  if (!leads?.length) return NextResponse.json({ ok: true, sent: 0 });

  let sent = 0;
  for (const lead of leads) {
    const result = await sendOutreach(admin, lead as LeadForOutreach);
    if (result.ok) {
      sent++;
      await admin.from("automation_events").insert({
        event_type: "outreach_sent", entity_type: "lead", entity_id: lead.id,
        payload_json: { source: "admin_override", attempt: (lead.outreach_attempts ?? 0) + 1 },
      });
    }
  }
  return NextResponse.json({ ok: true, sent });
}
