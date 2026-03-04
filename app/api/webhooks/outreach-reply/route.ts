import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

type ReplyBody = {
  lead_id?: string;
  handle?: string;
  platform?: string;
  message?: string;
};

export async function POST(request: Request) {
  const expected = process.env.OUTREACH_REPLY_SECRET?.trim() || process.env.CRON_SECRET?.trim() || "";
  if (expected) {
    const auth = request.headers.get("authorization") || "";
    const bearer = auth.startsWith("Bearer ") ? auth.slice(7) : "";
    if (bearer !== expected) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  let body: ReplyBody = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const admin = getSupabaseAdmin();
  let leadId = body.lead_id?.trim() || "";

  if (!leadId) {
    const handle = body.handle?.trim();
    const platform = body.platform?.trim();
    if (!handle || !platform) {
      return NextResponse.json({ error: "lead_id or (handle + platform) required" }, { status: 400 });
    }
    const { data: byHandle } = await admin
      .from("leads")
      .select("id")
      .eq("handle", handle)
      .eq("platform", platform)
      .maybeSingle();
    leadId = (byHandle as { id?: string | null } | null)?.id ?? "";
  }

  if (!leadId) {
    return NextResponse.json({ error: "Lead not found" }, { status: 404 });
  }

  const now = new Date().toISOString();
  const replyMessage = body.message?.trim() || "";
  const { data: current } = await admin.from("leads").select("notes").eq("id", leadId).maybeSingle();
  const existingNotes = ((current as { notes?: string | null } | null)?.notes ?? "").trim();
  const mergedNotes = replyMessage
    ? existingNotes
      ? `${existingNotes}\n\n[Reply ${now}]\n${replyMessage}`
      : `[Reply ${now}]\n${replyMessage}`
    : existingNotes || null;

  const { error: updateError } = await admin
    .from("leads")
    .update({
      status: "replied",
      notes: mergedNotes,
      updated_at: now,
    })
    .eq("id", leadId);
  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 400 });
  }

  await admin.from("automation_events").insert({
    event_type: "reply_received",
    entity_type: "lead",
    entity_id: leadId,
    payload_json: {
      source: "outreach_reply_webhook",
      has_message: !!replyMessage,
    },
  });

  return NextResponse.json({ ok: true, lead_id: leadId }, { status: 200 });
}
