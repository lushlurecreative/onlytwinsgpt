import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { isAdminUser } from "@/lib/admin";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

/**
 * GET /api/admin/ops/job-events — View job lifecycle events.
 *
 * Query params:
 *   ?job_type=generation|training|generation_request|identity_model
 *   ?job_id=<uuid>           — events for a specific job
 *   ?event=failed|completed|retried|reaped|cancelled|refunded  — filter by event type
 *   ?limit=50 (max 500)
 *
 * If job_id is provided, returns events for that specific job.
 * Otherwise returns recent events matching filters.
 */
export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isAdminUser(user.id, user.email)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const url = new URL(request.url);
  const jobType = url.searchParams.get("job_type");
  const jobId = url.searchParams.get("job_id");
  const event = url.searchParams.get("event");
  const limit = Math.min(Number(url.searchParams.get("limit")) || 50, 500);

  const admin = getSupabaseAdmin();
  let query = admin
    .from("job_events")
    .select("id, job_type, job_id, event, message, meta_json, created_at")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (jobType) query = query.eq("job_type", jobType);
  if (jobId) query = query.eq("job_id", jobId);
  if (event) query = query.eq("event", event);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ events: data ?? [], count: (data ?? []).length });
}
