/**
 * Outreach: log and update lead. Delivery: POST to OUTREACH_WEBHOOK_URL if set (Zapier/Make/n8n/your server), else sendAlert.
 * Set OUTREACH_WEBHOOK_URL in Vercel to receive POST with { lead_id, handle, platform, message, sample_asset_path }.
 */

import { sendAlert } from "@/lib/observability";

const OUTREACH_WEBHOOK_URL = process.env.OUTREACH_WEBHOOK_URL?.trim();

async function deliverOutreach(payload: {
  lead_id: string;
  handle: string;
  platform: string;
  message: string;
  sample_asset_path?: string | null;
}): Promise<void> {
  if (OUTREACH_WEBHOOK_URL) {
    try {
      await fetch(OUTREACH_WEBHOOK_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...payload, ts: new Date().toISOString() }),
      });
    } catch {
      // Fall through to sendAlert
    }
  }
  await sendAlert("lead_outreach_triggered", {
    lead_id: payload.lead_id,
    handle: payload.handle,
    platform: payload.platform,
    sample_preview_path: payload.sample_asset_path,
    outreach_message: payload.message,
  });
}

const DEFAULT_MESSAGE =
  "Hi {handle}, we help creators scale with done-for-you AI content. " +
  "We generated a personalized concept sample and can help you launch quickly. " +
  "Even if you do not want our services, the generated sample is yours to keep and use. " +
  "Click to learn more.";

export type LeadForOutreach = {
  id: string;
  handle: string;
  platform: string;
  sample_preview_path?: string | null;
  sample_asset_path?: string | null;
  notes?: string | null;
  outreach_attempts: number;
};

/**
 * Send outreach for one lead: insert outreach_logs, update lead, sendAlert.
 * Caller must ensure lead.outreach_attempts < max_attempts and status allows outreach.
 */
export async function sendOutreach(
  admin: ReturnType<typeof import("@/lib/supabase-admin").getSupabaseAdmin>,
  lead: LeadForOutreach,
  options?: { message?: string }
): Promise<{ ok: boolean; error?: string }> {
  const message = (options?.message ?? DEFAULT_MESSAGE).replace(/\{handle\}/g, lead.handle);
  const now = new Date().toISOString();
  const preview = message.slice(0, 200);

  const { error: logError } = await admin.from("outreach_logs").insert({
    lead_id: lead.id,
    sent_at: now,
    platform: lead.platform,
    message_preview: preview,
    delivery_status: "pending",
  });
  if (logError) return { ok: false, error: logError.message };

  await deliverOutreach({
    lead_id: lead.id,
    handle: lead.handle,
    platform: lead.platform,
    message,
    sample_asset_path: lead.sample_preview_path ?? lead.sample_asset_path,
  });

  const existingNotes = (lead.notes ?? "").trim();
  const newNotes = existingNotes
    ? `${existingNotes}\n\n[Outreach ${now}]\n${message}`
    : `[Outreach ${now}]\n${message}`;

  const { error: updateError } = await admin
    .from("leads")
    .update({
      status: "outreach_sent",
      outreach_last_sent_at: now,
      outreach_attempts: lead.outreach_attempts + 1,
      notes: newNotes,
      updated_at: now,
    })
    .eq("id", lead.id);
  if (updateError) return { ok: false, error: updateError.message };

  return { ok: true };
}
