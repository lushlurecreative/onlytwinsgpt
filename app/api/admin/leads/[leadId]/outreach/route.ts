import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { isAdminUser } from "@/lib/admin";
import { sendAlert } from "@/lib/observability";

type Params = {
  params: Promise<{ leadId: string }>;
};

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
  const { data: lead, error: leadError } = await admin
    .from("leads")
    .select("id, handle, platform, status, sample_preview_path, notes")
    .eq("id", leadId)
    .single();

  if (leadError || !lead) {
    return NextResponse.json({ error: leadError?.message ?? "Lead not found" }, { status: 404 });
  }
  if (lead.status !== "approved") {
    return NextResponse.json({ error: "Lead must be approved before outreach" }, { status: 400 });
  }

  const outreachMessage =
    `Hi ${lead.handle}, we help creators scale with done-for-you AI content. ` +
    `We generated a personalized concept sample and can help you launch quickly. ` +
    `Even if you do not want our services, the generated sample is yours to keep and use. ` +
    `Click to learn more.`;

  // Placeholder delivery hook; connect DM provider here.
  await sendAlert("lead_outreach_triggered", {
    lead_id: lead.id,
    handle: lead.handle,
    platform: lead.platform,
    sample_preview_path: lead.sample_preview_path,
    outreach_message: outreachMessage,
  });

  const existingNotes = (lead.notes ?? "").trim();
  const newNotes = existingNotes
    ? `${existingNotes}\n\n[Outreach ${new Date().toISOString()}]\n${outreachMessage}`
    : `[Outreach ${new Date().toISOString()}]\n${outreachMessage}`;

  const { error: updateError } = await admin
    .from("leads")
    .update({
      status: "messaged",
      messaged_at: new Date().toISOString(),
      notes: newNotes,
    })
    .eq("id", lead.id);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true }, { status: 200 });
}

