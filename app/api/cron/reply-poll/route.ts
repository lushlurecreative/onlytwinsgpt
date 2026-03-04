import { NextResponse } from "next/server";
import type { LeadStatus } from "@/lib/db-enums";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

function getCronSecret(): string {
  return process.env.CRON_SECRET?.trim() || "";
}

function isAuthorized(request: Request): boolean {
  const secret = getCronSecret();
  if (!secret) return false;
  const auth = request.headers.get("authorization") || "";
  const bearer = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  return bearer === secret;
}

type InboxRow = {
  id: string;
  lead_id: string | null;
  handle: string | null;
  platform: string | null;
  message: string;
  received_at: string;
};

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = getSupabaseAdmin();
  const now = new Date().toISOString();
  const limit = Math.min(Number(process.env.REPLY_POLL_MAX_PER_RUN || "50"), 200);

  const { data: inboxRows, error: inboxError } = await admin
    .from("reply_inbox")
    .select("id,lead_id,handle,platform,message,received_at")
    .is("processed_at", null)
    .order("received_at", { ascending: true })
    .limit(limit);

  if (inboxError) {
    await admin.from("system_events").insert({
      event_type: "reply_poll_failed",
      payload: { error: inboxError.message },
    });
    return NextResponse.json({ error: inboxError.message }, { status: 500 });
  }

  let processed = 0;
  let markedReplied = 0;
  let unresolved = 0;

  for (const row of (inboxRows ?? []) as InboxRow[]) {
    let leadId = row.lead_id;
    if (!leadId && row.handle && row.platform) {
      const { data: leadByHandle } = await admin
        .from("leads")
        .select("id")
        .eq("handle", row.handle)
        .eq("platform", row.platform)
        .maybeSingle();
      leadId = (leadByHandle as { id?: string | null } | null)?.id ?? null;
    }

    if (!leadId) {
      unresolved += 1;
      await admin
        .from("reply_inbox")
        .update({ processed_at: now, processing_error: "Lead not found" })
        .eq("id", row.id);
      continue;
    }

    const { data: currentLead } = await admin.from("leads").select("notes,status").eq("id", leadId).maybeSingle();
    const existingNotes = ((currentLead as { notes?: string | null } | null)?.notes ?? "").trim();
    const mergedNotes = existingNotes
      ? `${existingNotes}\n\n[Reply ${row.received_at}]\n${row.message}`
      : `[Reply ${row.received_at}]\n${row.message}`;

    await admin
      .from("leads")
      .update({
        status: "replied" as LeadStatus,
        notes: mergedNotes,
        updated_at: now,
      })
      .eq("id", leadId);

    await admin.from("automation_events").insert({
      event_type: "reply_received",
      entity_type: "lead",
      entity_id: leadId,
      payload_json: {
        inbox_id: row.id,
        source: "reply_poll",
      },
    });

    await admin.from("reply_inbox").update({ processed_at: now, processing_error: null }).eq("id", row.id);
    processed += 1;
    markedReplied += 1;
  }

  await admin.from("system_events").insert({
    event_type: "reply_poll_run",
    payload: {
      scanned: (inboxRows ?? []).length,
      processed,
      marked_replied: markedReplied,
      unresolved,
    },
  });

  return NextResponse.json({
    ok: true,
    scanned: (inboxRows ?? []).length,
    processed,
    marked_replied: markedReplied,
    unresolved,
  });
}
