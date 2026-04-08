import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { isAdminUser } from "@/lib/admin";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

/**
 * GET /api/admin/ops — List failed, stuck, and cancelled jobs with optional filters.
 *
 * Query params:
 *   ?filter=failed|stuck|cancelled|all (default: all)
 *   ?type=generation|training|generation_request|identity_model (default: all)
 *   ?limit=50 (max 200)
 */
export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isAdminUser(user.id, user.email)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const url = new URL(request.url);
  const filter = url.searchParams.get("filter") || "all";
  const type = url.searchParams.get("type") || "all";
  const limit = Math.min(Number(url.searchParams.get("limit")) || 50, 200);
  const admin = getSupabaseAdmin();
  const now = new Date();

  const result: Record<string, unknown[]> = {};

  // Stuck thresholds
  const genStuckCutoff = new Date(now.getTime() - 120 * 60 * 1000).toISOString(); // 2h
  const trainStuckCutoff = new Date(now.getTime() - 240 * 60 * 1000).toISOString(); // 4h

  // ── Generation Jobs ─────────────────────────────────────────
  if (type === "all" || type === "generation") {
    if (filter === "all" || filter === "failed") {
      const { data } = await admin
        .from("generation_jobs")
        .select("id, subject_id, preset_id, status, output_path, runpod_job_id, generation_request_id, dispatch_retry_count, failure_reason, created_at")
        .eq("status", "failed")
        .order("created_at", { ascending: false })
        .limit(limit);
      result.failed_generation_jobs = data ?? [];
    }
    if (filter === "all" || filter === "stuck") {
      const { data } = await admin
        .from("generation_jobs")
        .select("id, subject_id, preset_id, status, runpod_job_id, generation_request_id, created_at")
        .in("status", ["running", "upscaling", "watermarking"])
        .lt("created_at", genStuckCutoff)
        .order("created_at", { ascending: true })
        .limit(limit);
      result.stuck_generation_jobs = data ?? [];
    }
    if (filter === "all" || filter === "cancelled") {
      const { data } = await admin
        .from("generation_jobs")
        .select("id, subject_id, preset_id, status, runpod_job_id, generation_request_id, failure_reason, created_at")
        .eq("status", "cancelled")
        .order("created_at", { ascending: false })
        .limit(limit);
      result.cancelled_generation_jobs = data ?? [];
    }
  }

  // ── Training Jobs ───────────────────────────────────────────
  if (type === "all" || type === "training") {
    if (filter === "all" || filter === "failed") {
      const { data } = await admin
        .from("training_jobs")
        .select("id, subject_id, status, runpod_job_id, logs, photo_set_id, started_at, finished_at, created_at")
        .eq("status", "failed")
        .order("created_at", { ascending: false })
        .limit(limit);
      result.failed_training_jobs = data ?? [];
    }
    if (filter === "all" || filter === "stuck") {
      const { data } = await admin
        .from("training_jobs")
        .select("id, subject_id, status, runpod_job_id, started_at, created_at")
        .eq("status", "running")
        .or(`started_at.lt.${trainStuckCutoff},and(started_at.is.null,created_at.lt.${trainStuckCutoff})`)
        .order("created_at", { ascending: true })
        .limit(limit);
      result.stuck_training_jobs = data ?? [];
    }
  }

  // ── Generation Requests ─────────────────────────────────────
  if (type === "all" || type === "generation_request") {
    if (filter === "all" || filter === "failed") {
      const { data } = await admin
        .from("generation_requests")
        .select("id, user_id, status, failure_reason, progress_done, progress_total, started_at, failed_at, created_at")
        .eq("status", "failed")
        .order("created_at", { ascending: false })
        .limit(limit);
      result.failed_generation_requests = data ?? [];
    }
    if (filter === "all" || filter === "stuck") {
      const { data } = await admin
        .from("generation_requests")
        .select("id, user_id, status, progress_done, progress_total, started_at, created_at")
        .eq("status", "generating")
        .lt("started_at", genStuckCutoff)
        .order("created_at", { ascending: true })
        .limit(limit);
      result.stuck_generation_requests = data ?? [];
    }
  }

  // ── Identity Models ─────────────────────────────────────────
  if (type === "all" || type === "identity_model") {
    if (filter === "all" || filter === "failed") {
      const { data } = await admin
        .from("identity_models")
        .select("id, user_id, subject_id, version, status, failure_reason, training_job_id, created_at")
        .eq("status", "failed")
        .order("created_at", { ascending: false })
        .limit(limit);
      result.failed_identity_models = data ?? [];
    }
    if (filter === "all" || filter === "stuck") {
      const { data } = await admin
        .from("identity_models")
        .select("id, user_id, subject_id, version, status, training_job_id, started_at, created_at")
        .in("status", ["queued", "training"])
        .lt("created_at", trainStuckCutoff)
        .order("created_at", { ascending: true })
        .limit(limit);
      result.stuck_identity_models = data ?? [];
    }
  }

  return NextResponse.json(result);
}
