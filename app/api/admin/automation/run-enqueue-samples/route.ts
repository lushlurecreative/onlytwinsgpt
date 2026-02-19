import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { isAdminUser } from "@/lib/admin";
import { runEnqueueLeadSamples } from "@/lib/enqueue-lead-samples";

/** POST: Admin trigger for enqueue lead samples (same as cron). */
export async function POST() {
  const supabase = await createClient();
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isAdminUser(user.id)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const admin = getSupabaseAdmin();
  const { enqueued, reason } = await runEnqueueLeadSamples(admin);
  return NextResponse.json({ ok: true, enqueued, ...(reason ? { reason } : {}) });
}
