import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

type ReplyBody = {
  lead_id?: string;
  handle?: string;
  platform?: string;
  message?: string;
  payload?: Record<string, unknown>;
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
  const leadId = body.lead_id?.trim() || null;
  const handle = body.handle?.trim() || null;
  const platform = body.platform?.trim() || null;
  const message = body.message?.trim() || "";
  if (!message) {
    return NextResponse.json({ error: "message is required" }, { status: 400 });
  }

  const { error: insertError } = await admin.from("reply_inbox").insert({
    lead_id: leadId,
    handle,
    platform,
    message,
    payload_json: body.payload ?? {},
  });
  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 400 });
  }

  await admin.from("system_events").insert({
    event_type: "reply_ingested",
    payload: { lead_id: leadId, handle, platform },
  });

  return NextResponse.json({ ok: true }, { status: 200 });
}
