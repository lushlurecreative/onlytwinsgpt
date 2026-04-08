import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { logJobEvent, logJobEvents } from "@/lib/job-events";
import { failModel, getModelForTrainingJob } from "@/lib/identity-models";
import { createGenerationOutput } from "@/lib/generation-outputs";

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

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = getSupabaseAdmin();
  const now = new Date();
  const nowIso = now.toISOString();
  const generationMaxMinutes = Number(process.env.JOB_REAPER_GENERATION_MAX_MINUTES || "120");
  const trainingMaxMinutes = Number(process.env.JOB_REAPER_TRAINING_MAX_MINUTES || "240");
  const generationCutoffIso = new Date(now.getTime() - generationMaxMinutes * 60 * 1000).toISOString();
  const trainingCutoffIso = new Date(now.getTime() - trainingMaxMinutes * 60 * 1000).toISOString();

  // ── Reap stale generation jobs ──────────────────────────────
  const { data: staleGeneration } = await admin
    .from("generation_jobs")
    .select("id,status,created_at,generation_request_id")
    .in("status", ["running", "upscaling", "watermarking"])
    .lt("created_at", generationCutoffIso)
    .limit(200);

  const staleGenerationRows = (staleGeneration ?? []) as Array<{
    id: string;
    status: string;
    created_at: string;
    generation_request_id?: string | null;
  }>;
  const staleGenerationIds = staleGenerationRows.map((row) => row.id);
  if (staleGenerationIds.length > 0) {
    await admin
      .from("generation_jobs")
      .update({ status: "failed", failure_reason: "Marked failed by job reaper (stuck job)" })
      .in("id", staleGenerationIds);

    // Log job events for each reaped generation job
    await logJobEvents(
      staleGenerationRows.map((row) => ({
        jobType: "generation" as const,
        jobId: row.id,
        event: "reaped" as const,
        message: `Stuck in ${row.status} since ${row.created_at}`,
        meta: { previous_status: row.status, cutoff_minutes: generationMaxMinutes },
      }))
    );

    // Cascade: sync parent generation_requests
    const affectedRequestIds = new Set(
      staleGenerationRows
        .map((row) => row.generation_request_id)
        .filter(Boolean) as string[]
    );
    for (const requestId of affectedRequestIds) {
      try {
        await cascadeSyncRequest(admin, requestId);
      } catch { /* non-fatal */ }
    }
  }

  // ── Reap stale training jobs ────────────────────────────────
  const { data: staleTraining } = await admin
    .from("training_jobs")
    .select("id,status,created_at,started_at,subject_id")
    .eq("status", "running")
    .or(`started_at.lt.${trainingCutoffIso},and(started_at.is.null,created_at.lt.${trainingCutoffIso})`)
    .limit(200);

  const staleTrainingRows = (staleTraining ?? []) as Array<{
    id: string;
    status: string;
    created_at: string;
    started_at: string | null;
    subject_id: string;
  }>;
  const staleTrainingIds = staleTrainingRows.map((row) => row.id);
  if (staleTrainingIds.length > 0) {
    await admin
      .from("training_jobs")
      .update({ status: "failed", finished_at: nowIso, logs: "Marked failed by job reaper (stale running job)." })
      .in("id", staleTrainingIds);

    // Log job events for each reaped training job
    await logJobEvents(
      staleTrainingRows.map((row) => ({
        jobType: "training" as const,
        jobId: row.id,
        event: "reaped" as const,
        message: `Stuck in running since ${row.started_at ?? row.created_at}`,
        meta: { cutoff_minutes: trainingMaxMinutes },
      }))
    );

    // Cascade: mark linked identity_models as failed
    for (const row of staleTrainingRows) {
      try {
        const model = await getModelForTrainingJob(row.id);
        if (model && model.status !== "ready" && model.status !== "failed") {
          await failModel(model.id, "Training job timed out (reaped by job reaper)");
          await logJobEvent({
            jobType: "identity_model",
            jobId: model.id,
            event: "reaped",
            message: "Linked training job was reaped as stuck",
            meta: { training_job_id: row.id },
          });
        }
      } catch { /* non-fatal */ }

      // Notify user of training failure
      try {
        const { data: subject } = await admin
          .from("subjects")
          .select("user_id")
          .eq("id", row.subject_id)
          .maybeSingle();
        if (subject?.user_id) {
          await admin.from("user_notifications").insert({
            user_id: subject.user_id,
            type: "training_failed",
            payload_json: {
              training_job_id: row.id,
              message: "Your model training could not be completed. Our team has been notified and will investigate.",
            },
          });
        }
      } catch { /* non-fatal */ }
    }
  }

  // ── Reap stale pending generation jobs (stuck in queue) ─────
  const pendingCutoffIso = new Date(now.getTime() - generationMaxMinutes * 2 * 60 * 1000).toISOString();
  const { data: stalePending } = await admin
    .from("generation_jobs")
    .select("id,created_at,generation_request_id")
    .eq("status", "pending")
    .lt("created_at", pendingCutoffIso)
    .limit(200);

  const stalePendingRows = (stalePending ?? []) as Array<{
    id: string;
    created_at: string;
    generation_request_id?: string | null;
  }>;
  const stalePendingIds = stalePendingRows.map((row) => row.id);
  if (stalePendingIds.length > 0) {
    await admin
      .from("generation_jobs")
      .update({ status: "failed", failure_reason: "Marked failed by job reaper (stuck pending)" })
      .in("id", stalePendingIds);

    await logJobEvents(
      stalePendingRows.map((row) => ({
        jobType: "generation" as const,
        jobId: row.id,
        event: "reaped" as const,
        message: `Stuck in pending since ${row.created_at}`,
        meta: { cutoff_minutes: generationMaxMinutes * 2 },
      }))
    );

    const pendingRequestIds = new Set(
      stalePendingRows
        .map((row) => row.generation_request_id)
        .filter(Boolean) as string[]
    );
    for (const requestId of pendingRequestIds) {
      try {
        await cascadeSyncRequest(admin, requestId);
      } catch { /* non-fatal */ }
    }
  }

  await admin.from("system_events").insert({
    event_type: "job_reaper_run",
    payload: {
      stale_generation_jobs: staleGenerationIds.length,
      stale_training_jobs: staleTrainingIds.length,
      stale_pending_jobs: stalePendingIds.length,
      generation_cutoff: generationCutoffIso,
      training_cutoff: trainingCutoffIso,
    },
  });

  return NextResponse.json({
    ok: true,
    stale_generation_jobs: staleGenerationIds.length,
    stale_training_jobs: staleTrainingIds.length,
    stale_pending_jobs: stalePendingIds.length,
  });
}

/**
 * Simplified cascade sync for reaped jobs: check if all jobs for a request
 * are terminal and update the request accordingly.
 */
async function cascadeSyncRequest(admin: ReturnType<typeof getSupabaseAdmin>, requestId: string) {
  const { data: request } = await admin
    .from("generation_requests")
    .select("id, user_id, status")
    .eq("id", requestId)
    .maybeSingle();
  if (!request || request.status === "completed" || request.status === "failed") return;

  const { data: jobs } = await admin
    .from("generation_jobs")
    .select("id, status, output_path")
    .eq("generation_request_id", requestId);
  const rows = (jobs ?? []) as Array<{ id: string; status: string; output_path?: string | null }>;
  const inFlight = rows.filter((r) => r.status === "pending" || r.status === "running" || r.status === "upscaling" || r.status === "watermarking");
  if (inFlight.length > 0) return; // Still has active jobs

  const completed = rows.filter((r) => r.status === "completed");
  const outputPaths = completed.map((r) => r.output_path).filter(Boolean) as string[];

  if (completed.length === 0) {
    // All jobs failed/cancelled
    const failureReason = `All ${rows.length} generation job(s) failed or were reaped`;
    await admin
      .from("generation_requests")
      .update({
        status: "failed",
        failure_reason: failureReason,
        failed_at: new Date().toISOString(),
        progress_done: 0,
        progress_total: rows.length,
      })
      .eq("id", requestId);

    // Refund usage
    await refundUsageOnReap(admin, requestId);

    // Notify user
    if (request.user_id) {
      try {
        await admin.from("user_notifications").insert({
          user_id: request.user_id,
          type: "generation_failed",
          payload_json: {
            generation_request_id: requestId,
            message: "Your content generation request could not be completed. Your credits have been refunded.",
          },
        });
      } catch { /* non-fatal */ }
    }

    await logJobEvent({
      jobType: "generation_request",
      jobId: requestId,
      event: "failed",
      message: failureReason,
      meta: { source: "job_reaper_cascade" },
    });
  } else {
    // Partial completion — create posts and generation_outputs for completed jobs
    const userId = request.user_id as string;
    for (const row of completed) {
      if (!row.output_path) continue;
      try {
        // Create post
        const { data: existingPost } = await admin
          .from("posts")
          .select("id")
          .eq("creator_id", userId)
          .eq("storage_path", row.output_path)
          .limit(1)
          .maybeSingle();
        if (!existingPost) {
          await admin.from("posts").insert({
            creator_id: userId,
            storage_path: row.output_path,
            caption: "Generated content (recovered by job reaper)",
            visibility: "subscribers",
            is_published: false,
            generation_job_id: row.id,
          });
        }
        // Create generation_output
        const isVideo = /\.mp4$/i.test(row.output_path);
        await createGenerationOutput({
          generation_request_id: requestId,
          generation_job_id: row.id,
          user_id: userId,
          output_type: isVideo ? "video" : "image",
          storage_path: row.output_path,
        });
      } catch { /* non-fatal — don't block cascade */ }
    }

    await admin
      .from("generation_requests")
      .update({
        status: "completed",
        completed_at: new Date().toISOString(),
        progress_done: outputPaths.length,
        progress_total: rows.length,
        output_paths: outputPaths,
      })
      .eq("id", requestId);

    await logJobEvent({
      jobType: "generation_request",
      jobId: requestId,
      event: "completed",
      message: `${outputPaths.length}/${rows.length} outputs (reaped cascade)`,
      meta: { source: "job_reaper_cascade" },
    });
  }
}

/**
 * Refund usage for a request that fully failed due to reaping.
 */
async function refundUsageOnReap(admin: ReturnType<typeof getSupabaseAdmin>, requestId: string) {
  const { data: usageEntry } = await admin
    .from("usage_ledger")
    .select("id, user_id, image_units, video_units, period_start, period_end")
    .eq("generation_request_id", requestId)
    .eq("source", "generation_request")
    .limit(1)
    .maybeSingle();
  if (!usageEntry || (usageEntry.image_units === 0 && usageEntry.video_units === 0)) return;

  const { data: existingRefund } = await admin
    .from("usage_ledger")
    .select("id")
    .eq("generation_request_id", requestId)
    .eq("source", "refund")
    .limit(1)
    .maybeSingle();
  if (existingRefund) return;

  await admin.from("usage_ledger").insert({
    user_id: usageEntry.user_id,
    generation_request_id: requestId,
    source: "refund",
    image_units: -(usageEntry.image_units as number),
    video_units: -(usageEntry.video_units as number),
    period_start: usageEntry.period_start,
    period_end: usageEntry.period_end,
    idempotency_key: `refund:${requestId}`,
    metadata_json: { reason: "reaped_by_job_reaper" },
  });

  await logJobEvent({
    jobType: "generation_request",
    jobId: requestId,
    event: "refunded",
    message: `Refunded ${usageEntry.image_units} images, ${usageEntry.video_units} videos (reaper cascade)`,
  });
}
