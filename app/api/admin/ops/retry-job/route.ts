import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { isAdminUser } from "@/lib/admin";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { dispatchGenerationJobToRunPod } from "@/lib/runpod";
import { logJobEvent } from "@/lib/job-events";
import { writeAuditLog } from "@/lib/audit-log";
import type { GenerationJobStatus } from "@/lib/db-enums";

/**
 * POST /api/admin/ops/retry-job — Retry a failed generation job.
 *
 * Body: { job_id: string, job_type: "generation" }
 *
 * Only generation jobs can be retried (re-dispatched to RunPod).
 * Training jobs require a full re-queue, not a simple retry.
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isAdminUser(user.id, user.email)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await request.json() as { job_id?: string; job_type?: string };
  const { job_id, job_type } = body;
  if (!job_id) return NextResponse.json({ error: "job_id required" }, { status: 400 });
  if (job_type !== "generation") return NextResponse.json({ error: "Only generation jobs can be retried" }, { status: 400 });

  const admin = getSupabaseAdmin();

  const { data: job } = await admin
    .from("generation_jobs")
    .select("id, status, subject_id, preset_id, reference_image_path, lora_model_reference, controlnet_input_path, job_type, lead_id, dispatch_retry_count, runpod_job_id")
    .eq("id", job_id)
    .maybeSingle();

  if (!job) return NextResponse.json({ error: "Job not found" }, { status: 404 });
  if ((job.status as string) !== "failed" && (job.status as string) !== "cancelled") {
    return NextResponse.json({ error: `Job is ${job.status}, not retriable` }, { status: 400 });
  }

  const nextRunpodId = await dispatchGenerationJobToRunPod(job.id as string, {
    subject_id: (job.subject_id as string) ?? null,
    preset_id: job.preset_id as string,
    reference_image_path: job.reference_image_path as string,
    lora_model_reference: (job.lora_model_reference as string) ?? null,
    controlnet_input_path: (job.controlnet_input_path as string) ?? null,
    job_type: (job.job_type as "user" | "lead_sample") ?? "user",
    lead_id: (job.lead_id as string) ?? null,
  });

  if (!nextRunpodId) {
    return NextResponse.json({ error: "Failed to dispatch to RunPod" }, { status: 502 });
  }

  const retryCount = Number(job.dispatch_retry_count ?? 0) + 1;
  await admin
    .from("generation_jobs")
    .update({
      status: "pending" as GenerationJobStatus,
      runpod_job_id: nextRunpodId,
      dispatch_retry_count: retryCount,
      failure_reason: null,
      lease_owner: null,
      lease_until: null,
    })
    .eq("id", job_id);

  await logJobEvent({
    jobType: "generation",
    jobId: job_id,
    event: "retried",
    message: `Admin retry by ${user.email}`,
    meta: { new_runpod_job_id: nextRunpodId, retry_count: retryCount, admin_user: user.id },
  });

  await writeAuditLog(admin, {
    actor: user.id,
    actionType: "admin.ops.retry_generation_job",
    entityRef: `generation_job:${job_id}`,
    afterJson: { runpod_job_id: nextRunpodId, retry_count: retryCount },
  });

  return NextResponse.json({ ok: true, new_runpod_job_id: nextRunpodId, retry_count: retryCount });
}
