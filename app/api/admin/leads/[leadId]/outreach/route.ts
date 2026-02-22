import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { isAdminUser } from "@/lib/admin";
import { sendOutreach, type LeadForOutreach } from "@/lib/outreach";
import type { LeadStatus } from "@/lib/db-enums";

type Params = { params: Promise<{ leadId: string }> };

export async function POST(_request: Request, { params }: Params) {
  const { leadId } = await params;
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
  const { data: maxRow } = await admin
    .from("app_settings")
    .select("value")
    .eq("key", "outreach_max_attempts")
    .maybeSingle();
  const maxAttempts = Math.max(1, parseInt(String(maxRow?.value ?? "3"), 10) || 3);

  const { data: lead, error: leadError } = await admin
    .from("leads")
    .select("id, handle, platform, status, sample_preview_path, sample_asset_path, notes, outreach_attempts")
    .eq("id", leadId)
    .single();

  if (leadError || !lead) {
    return NextResponse.json({ error: leadError?.message ?? "Lead not found" }, { status: 404 });
  }

  const allowedStatuses: LeadStatus[] = ["approved", "sample_done"];
  if (!allowedStatuses.includes(lead.status as LeadStatus)) {
    return NextResponse.json(
      { error: `Lead must be approved or sample_done before outreach. Current: ${lead.status}` },
      { status: 400 }
    );
  }
  const attempts = (lead.outreach_attempts ?? 0) as number;
  if (attempts >= maxAttempts) {
    return NextResponse.json(
      { error: `Max outreach attempts (${maxAttempts}) reached for this lead.` },
      { status: 400 }
    );
  }

  const result = await sendOutreach(admin, lead as LeadForOutreach);
  if (!result.ok) {
    return NextResponse.json({ error: result.error ?? "Outreach failed" }, { status: 500 });
  }

  await admin.from("automation_events").insert({
    event_type: "outreach_sent",
    entity_type: "lead",
    entity_id: leadId,
    payload_json: { source: "admin_send_outreach", attempt: attempts + 1 },
  });

  return NextResponse.json({ ok: true }, { status: 200 });
}
