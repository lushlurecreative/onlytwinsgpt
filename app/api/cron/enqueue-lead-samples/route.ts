import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { runEnqueueLeadSamples } from "@/lib/enqueue-lead-samples";

function getCronSecret(): string {
  return process.env.CRON_SECRET?.trim() || "";
}

/** GET: Enqueue qualified leads as lead_sample generation jobs (idempotent). Secured by CRON_SECRET. */
export async function GET(request: Request) {
  const secret = getCronSecret();
  const auth = request.headers.get("authorization") || "";
  const bearer = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (secret && bearer !== secret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = getSupabaseAdmin();
  const { enqueued, reason } = await runEnqueueLeadSamples(admin);
  return NextResponse.json({ ok: true, enqueued, ...(reason ? { reason } : {}) });
}
