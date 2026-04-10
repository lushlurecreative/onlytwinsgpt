import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import type { LeadStatus } from "@/lib/db-enums";
import type { GenerationJobStatus } from "@/lib/db-enums";
import { dispatchGenerationJobToRunPod } from "@/lib/runpod";
import { generateVideo } from "@/lib/video-generation";
import { updatePhotoSetStatus } from "@/lib/training-photo-sets";
import { getModelForTrainingJob, completeModel, failModel, updateModelStatus } from "@/lib/identity-models";
import { createGenerationOutput } from "@/lib/generation-outputs";
import { logJobEvent, claimCallbackProcessing } from "@/lib/job-events";

async function ensurePost(admin: ReturnType<typeof getSupabaseAdmin>, userId: string, path: string, caption: string, generationJobId?: string | null) {
  const { data: existing } = await admin
    .from("posts")
    .select("id, generation_job_id")
    .eq("creator_id", userId)
    .eq("storage_path", path)
    .limit(1)
    .maybeSingle();
  if (existing?.id) {
    // Backfill generation_job_id if missing
    if (generationJobId && !existing.generation_job_id) {
      await admin.from("posts").update({ generation_job_id: generationJobId }).eq("id", existing.id);
    }
    return;
  }
  await admin.from("posts").insert({
    creator_id: userId,
    storage_path: path,
    caption,
    visibility: "subscribers",
    is_published: false,
    generation_job_id: generationJobId ?? null,
  });
}

/**
 * Refund usage credits when a generation_request fully fails.
 * Inserts a negative usage_ledger entry to reverse the original deduction.
 */
async function refundUsageOnFailure(admin: ReturnType<typeof getSupabaseAdmin>, requestId: string) {
  // Get the original usage entry for this request
  const { data: usageEntry } = await admin
    .from("usage_ledger")
    .select("id, user_id, image_units, video_units, period_start, period_end")
    .eq("generation_request_id", requestId)
    .eq("source", "generation_request")
    .limit(1)
    .maybeSingle();
  if (!usageEntry || (usageEntry.image_units === 0 && usageEntry.video_units === 0)) return;

  // Check if already refunded
  const { data: existingRefund } = await admin
    .from("usage_ledger")
    .select("id")
    .eq("generation_request_id", requestId)
    .eq("source", "refund")
    .limit(1)
    .maybeSingle();
  if (existingRefund) return; // Already refunded — idempotent

  // Insert negative entry
  await admin.from("usage_ledger").insert({
    user_id: usageEntry.user_id,
    generation_request_id: requestId,
    source: "refund",
    image_units: -(usageEntry.image_units as number),
    video_units: -(usageEntry.video_units as number),
    period_start: usageEntry.period_start,
    period_end: usageEntry.period_end,
    idempotency_key: `refund:${requestId}`,
    metadata_json: { reason: "generation_request_failed", original_usage_id: usageEntry.id },
  });

  await logJobEvent({
    jobType: "generation_request",
    jobId: requestId,
    event: "refunded",
    message: `Refunded ${usageEntry.image_units} images, ${usageEntry.video_units} videos`,
    meta: { original_usage_id: usageEntry.id },
  });
}

/**
 * Send a user notification. Fire-and-forget.
 */
async function notifyUser(
  admin: ReturnType<typeof getSupabaseAdmin>,
  userId: string,
  type: string,
  payload: Record<string, unknown>
) {
  try {
    await admin.from("user_notifications").insert({
      user_id: userId,
      type,
      payload_json: payload,
    });
  } catch { /* non-fatal */ }
}

async function syncCustomerRequestState(admin: ReturnType<typeof getSupabaseAdmin>, requestId: string) {
  const { data: requestRow } = await admin
    .from("generation_requests")
    .select("id,user_id,scene_preset,content_mode,video_count,status,output_paths,completed_at")
    .eq("id", requestId)
    .maybeSingle();
  const request = (requestRow ?? null) as
    | {
        id: string;
        user_id: string;
        scene_preset: string;
        content_mode?: "sfw" | "mature";
        video_count: number;
        status: string;
        output_paths?: string[] | null;
        completed_at?: string | null;
      }
    | null;
  if (!request) return;

  const { data: jobs } = await admin
    .from("generation_jobs")
    .select("id,status,output_path")
    .eq("generation_request_id", requestId);
  const rows = (jobs ?? []) as Array<{ id: string; status: GenerationJobStatus; output_path?: string | null }>;
  const completed = rows.filter((row) => row.status === "completed");
  const failed = rows.filter((row) => row.status === "failed" || row.status === "cancelled");
  const inFlight = rows.filter((row) => row.status === "pending" || row.status === "running" || row.status === "upscaling" || row.status === "watermarking");

  // Build a map of output_path → job_id for lineage
  const pathToJobId = new Map<string, string>();
  for (const row of completed) {
    if (row.output_path) pathToJobId.set(row.output_path, row.id);
  }

  const outputPaths = Array.from(
    new Set([
      ...((request.output_paths ?? []) as string[]),
      ...completed.map((row) => row.output_path).filter(Boolean) as string[],
    ])
  );
  const caption = `OnlyTwins ${request.scene_preset} set (${(request.content_mode ?? "sfw").toUpperCase()})`;
  for (const outputPath of outputPaths) {
    const jobId = pathToJobId.get(outputPath) ?? null;
    await ensurePost(admin, request.user_id, outputPath, caption, jobId);
    // Create generation_output record for structured output tracking
    const isVideo = /\.mp4$/i.test(outputPath);
    await createGenerationOutput({
      generation_request_id: requestId,
      generation_job_id: jobId,
      user_id: request.user_id,
      output_type: isVideo ? "video" : "image",
      storage_path: outputPath,
    });
  }

  if (inFlight.length > 0) {
    await admin
      .from("generation_requests")
      .update({
        status: "generating",
        progress_done: outputPaths.length,
        progress_total: rows.length + Math.max(0, request.video_count),
        output_paths: outputPaths,
      })
      .eq("id", requestId);
    return;
  }

  if (failed.length > 0 && completed.length === 0) {
    // All jobs failed — request fully failed
    const failureReason = `All ${failed.length} generation job(s) failed`;
    await admin
      .from("generation_requests")
      .update({
        status: "failed",
        failure_reason: failureReason,
        failed_at: new Date().toISOString(),
        progress_done: outputPaths.length,
        progress_total: rows.length + Math.max(0, request.video_count),
        output_paths: outputPaths,
      })
      .eq("id", requestId);

    // Refund usage credits
    await refundUsageOnFailure(admin, requestId);

    // Notify user
    await notifyUser(admin, request.user_id, "generation_failed", {
      generation_request_id: requestId,
      message: "Your content generation request could not be completed. Your credits have been refunded.",
    });

    await logJobEvent({
      jobType: "generation_request",
      jobId: requestId,
      event: "failed",
      message: failureReason,
      meta: { total_jobs: rows.length, failed_count: failed.length },
    });
    return;
  }

  const existingVideoCount = outputPaths.filter((p) => p.endsWith(".mp4")).length;
  if (request.video_count > existingVideoCount) {
    const imagePaths = outputPaths.filter((p) => /\.(jpg|jpeg|png|webp)$/i.test(p));
    for (let i = existingVideoCount; i < request.video_count; i += 1) {
      if (imagePaths.length === 0) break;
      const source = imagePaths[i % imagePaths.length];
      const { data: imgBlob, error: imgErr } = await admin.storage.from("uploads").download(source);
      if (imgErr || !imgBlob) continue;
      const bytes = new Uint8Array(await imgBlob.arrayBuffer());
      const b64 = Buffer.from(bytes).toString("base64");
      const dataUri = `data:image/jpeg;base64,${b64}`;
      try {
        const { videoUrl } = await generateVideo({
          imageUrl: dataUri,
          prompt: `OnlyTwins ${request.scene_preset} motion`,
        });
        const vidRes = await fetch(videoUrl);
        if (!vidRes.ok) continue;
        const vidBytes = new Uint8Array(await vidRes.arrayBuffer());
        const vidPath = `${request.user_id}/generated/request-${request.id}-vid-${i + 1}.mp4`;
        const { error: vidUpErr } = await admin.storage.from("uploads").upload(vidPath, vidBytes, {
          contentType: "video/mp4",
          upsert: false,
        });
        if (vidUpErr) continue;
        outputPaths.push(vidPath);
        await ensurePost(admin, request.user_id, vidPath, caption);
        await createGenerationOutput({
          generation_request_id: requestId,
          user_id: request.user_id,
          output_type: "video",
          storage_path: vidPath,
          file_size: vidBytes.length,
        });
      } catch {
        // Keep image outputs even if video generation is not available.
      }
    }
  }

  const finalDone = outputPaths.length;
  const finalTotal = rows.length + Math.max(0, request.video_count);
  const finalStatus = finalDone >= Math.max(1, finalTotal) ? "completed" : "failed";

  if (finalStatus === "failed") {
    const failureReason = `Only ${finalDone} of ${finalTotal} outputs produced`;
    await admin
      .from("generation_requests")
      .update({
        status: "failed",
        failure_reason: failureReason,
        progress_done: finalDone,
        progress_total: finalTotal,
        output_paths: outputPaths,
        failed_at: new Date().toISOString(),
      })
      .eq("id", requestId);

    // Partial failure — still notify but don't refund (some outputs were produced)
    await notifyUser(admin, request.user_id, "generation_failed", {
      generation_request_id: requestId,
      message: `Your content generation partially completed (${finalDone}/${finalTotal}). Some items could not be generated.`,
    });

    await logJobEvent({
      jobType: "generation_request",
      jobId: requestId,
      event: "failed",
      message: failureReason,
      meta: { done: finalDone, total: finalTotal },
    });
  } else {
    await admin
      .from("generation_requests")
      .update({
        status: "completed",
        progress_done: finalDone,
        progress_total: finalTotal,
        output_paths: outputPaths,
        completed_at: request.completed_at ?? new Date().toISOString(),
      })
      .eq("id", requestId);

    // Notify user of completion
    await notifyUser(admin, request.user_id, "generation_completed", {
      generation_request_id: requestId,
      message: `Your content is ready! ${finalDone} new items have been added to your library.`,
      output_count: finalDone,
    });

    await logJobEvent({
      jobType: "generation_request",
      jobId: requestId,
      event: "completed",
      message: `${finalDone} outputs produced`,
      meta: { done: finalDone, total: finalTotal },
    });
  }
}

/**
 * RunPod Serverless webhook: RunPod POSTs here when a job completes/fails.
 * Payload: same as /status (id, status, output?, error?). We look up our job by runpod_job_id.
 */
export async function POST(request: Request) {
  let body: { id?: string; status?: string; output?: unknown; error?: string } = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const runpodId = body.id;
  const status = body.status;
  if (!runpodId || !status) {
    return NextResponse.json({ error: "Missing id or status" }, { status: 400 });
  }

  const admin = getSupabaseAdmin();

  // ── FAILED / TIMED_OUT / CANCELLED ──────────────────────────
  if (status === "FAILED" || status === "TIMED_OUT" || status === "CANCELLED") {
    const errMsg = body.error || status;

    // Try training_jobs first — look up without mutating so we can claim atomically
    const { data: trainingLookup } = await admin
      .from("training_jobs")
      .select("id, photo_set_id, subject_id")
      .eq("runpod_job_id", runpodId)
      .maybeSingle();
    if (trainingLookup?.id) {
      // Atomic dedup claim — race-safe via UNIQUE partial index job_events_dedup_idx
      const claimed = await claimCallbackProcessing("training", trainingLookup.id as string, "failed", {
        runpod_job_id: runpodId,
        runpod_status: status,
      });
      if (!claimed) {
        return NextResponse.json({ ok: true, duplicate: true });
      }

      await admin
        .from("training_jobs")
        .update({ status: "failed", logs: `RunPod: ${errMsg}` })
        .eq("id", trainingLookup.id as string);

      await logJobEvent({
        jobType: "training",
        jobId: trainingLookup.id as string,
        event: "failed",
        message: errMsg,
        meta: { runpod_job_id: runpodId, runpod_status: status },
      });

      // Cascade: update photo set status
      if ((trainingLookup as { photo_set_id?: string | null }).photo_set_id) {
        try {
          await updatePhotoSetStatus((trainingLookup as { photo_set_id: string }).photo_set_id, "failed");
        } catch { /* non-fatal */ }
      }
      // Cascade: update identity_model on failure
      try {
        const model = await getModelForTrainingJob(trainingLookup.id as string);
        if (model) {
          await failModel(model.id, errMsg);
          await logJobEvent({
            jobType: "identity_model",
            jobId: model.id,
            event: "failed",
            message: errMsg,
            meta: { training_job_id: trainingLookup.id },
          });
        }
      } catch { /* non-fatal */ }

      // Notify user of training failure
      try {
        const { data: subject } = await admin
          .from("subjects")
          .select("user_id")
          .eq("id", (trainingLookup as { subject_id?: string | null }).subject_id ?? "")
          .maybeSingle();
        if (subject?.user_id) {
          await notifyUser(admin, subject.user_id as string, "training_failed", {
            training_job_id: trainingLookup.id,
            message: "Your model training could not be completed. Our team has been notified and will investigate.",
          });
        }
      } catch { /* non-fatal */ }

      return NextResponse.json({ ok: true, updated: "training_job" });
    }

    // Try generation_jobs
    const { data: failedGen } = await admin
      .from("generation_jobs")
      .select(
        "id,status,generation_request_id,subject_id,preset_id,reference_image_path,lora_model_reference,controlnet_input_path,job_type,lead_id,dispatch_retry_count"
      )
      .eq("runpod_job_id", runpodId)
      .maybeSingle();
    const failedJob = (failedGen ?? null) as
      | {
          id: string;
          status: GenerationJobStatus;
          generation_request_id?: string | null;
          subject_id?: string | null;
          preset_id: string;
          reference_image_path: string;
          lora_model_reference?: string | null;
          controlnet_input_path?: string | null;
          job_type?: "user" | "lead_sample";
          lead_id?: string | null;
          dispatch_retry_count?: number | null;
        }
      | null;
    if (failedJob) {
      // Fix 3: cancelled jobs are terminal — late RunPod callbacks must not
      // un-cancel or auto-retry them. Log and short-circuit.
      if ((failedJob.status as GenerationJobStatus) === "cancelled") {
        await logJobEvent({
          jobType: "generation",
          jobId: failedJob.id,
          event: "callback_received",
          message: `Late ${status} callback ignored — job already cancelled`,
          meta: { runpod_job_id: runpodId, runpod_status: status },
        });
        return NextResponse.json({ ok: true, ignored: "cancelled" });
      }

      const currentRetries = Number(failedJob.dispatch_retry_count ?? 0);
      const maxRetries = Number(process.env.GENERATION_JOB_MAX_RETRIES || "2");
      if ((failedJob.job_type ?? "user") === "user" && currentRetries < maxRetries) {
        const nextRunpodId = await dispatchGenerationJobToRunPod(failedJob.id, {
          subject_id: failedJob.subject_id ?? null,
          preset_id: failedJob.preset_id,
          reference_image_path: failedJob.reference_image_path,
          lora_model_reference: failedJob.lora_model_reference ?? null,
          controlnet_input_path: failedJob.controlnet_input_path ?? null,
          job_type: failedJob.job_type ?? "user",
          lead_id: failedJob.lead_id ?? null,
        });
        if (nextRunpodId) {
          await admin
            .from("generation_jobs")
            .update({
              status: "pending" as GenerationJobStatus,
              runpod_job_id: nextRunpodId,
              dispatch_retry_count: currentRetries + 1,
              lease_owner: null,
              lease_until: null,
            })
            .eq("id", failedJob.id);

          await logJobEvent({
            jobType: "generation",
            jobId: failedJob.id,
            event: "retried",
            message: `Retry ${currentRetries + 1}/${maxRetries}: ${errMsg}`,
            meta: { runpod_job_id: runpodId, new_runpod_job_id: nextRunpodId, retry_count: currentRetries + 1 },
          });

          return NextResponse.json({ ok: true, updated: "generation_job_retried" });
        }
      }
      // Max retries exhausted or dispatch failed — terminal failure.
      // Atomic claim BEFORE mutation: race-safe via UNIQUE partial index.
      const claimed = await claimCallbackProcessing("generation", failedJob.id, "failed", {
        runpod_job_id: runpodId,
        runpod_status: status,
      });
      if (!claimed) {
        return NextResponse.json({ ok: true, duplicate: true });
      }

      await admin
        .from("generation_jobs")
        .update({
          status: "failed" as GenerationJobStatus,
          failure_reason: errMsg,
        })
        .eq("id", failedJob.id);

      await logJobEvent({
        jobType: "generation",
        jobId: failedJob.id,
        event: "failed",
        message: errMsg,
        meta: { runpod_job_id: runpodId, runpod_status: status, retries_exhausted: currentRetries >= maxRetries },
      });

      if (failedJob.generation_request_id) {
        await syncCustomerRequestState(admin, failedJob.generation_request_id);
      }
    }
    return NextResponse.json({ ok: true, updated: "generation_job" });
  }

  // ── COMPLETED ───────────────────────────────────────────────
  if (status === "COMPLETED") {
    // Try training_jobs first
    const { data: training } = await admin
      .from("training_jobs")
      .select("id, status, photo_set_id, subject_id")
      .eq("runpod_job_id", runpodId)
      .maybeSingle();
    if (training?.id && training.status !== "completed") {
      // Atomic dedup claim — race-safe via UNIQUE partial index
      const claimed = await claimCallbackProcessing("training", training.id as string, "completed", {
        runpod_job_id: runpodId,
      });
      if (!claimed) {
        return NextResponse.json({ ok: true, duplicate: true });
      }

      await admin
        .from("training_jobs")
        .update({
          status: "completed",
          finished_at: new Date().toISOString(),
          logs: "Completed via RunPod webhook",
        })
        .eq("id", training.id);

      await logJobEvent({
        jobType: "training",
        jobId: training.id as string,
        event: "completed",
        message: "Completed via RunPod webhook",
        meta: { runpod_job_id: runpodId },
      });

      // Cascade: update photo set status to trained
      if ((training as { photo_set_id?: string | null }).photo_set_id) {
        try {
          await updatePhotoSetStatus((training as { photo_set_id: string }).photo_set_id, "trained");
        } catch { /* non-fatal */ }
      }
      // Cascade: update identity_model
      try {
        const identityModel = await getModelForTrainingJob(training.id as string);
        if (identityModel && identityModel.status !== "ready") {
          if (identityModel.model_path) {
            await completeModel(identityModel.id, {});
          } else {
            await updateModelStatus(identityModel.id, "training", {
              completed_at: new Date().toISOString(),
            });
          }
          await logJobEvent({
            jobType: "identity_model",
            jobId: identityModel.id,
            event: "completed",
            message: identityModel.model_path ? "Activated as ready" : "Awaiting artifacts from worker",
            meta: { training_job_id: training.id },
          });
        }
      } catch { /* non-fatal */ }

      // Notify user of training completion
      const subjectId = (training as { subject_id?: string | null }).subject_id;
      if (subjectId) {
        const { data: subject } = await admin
          .from("subjects")
          .select("user_id")
          .eq("id", subjectId)
          .maybeSingle();
        if (subject?.user_id) {
          await notifyUser(admin, subject.user_id as string, "training_complete", {
            training_job_id: training.id,
            message: "Your model training is complete. You can now generate images.",
          });
        }
      }
      return NextResponse.json({ ok: true, updated: "training_job" });
    }

    // Try generation_jobs
    const { data: gen } = await admin
      .from("generation_jobs")
      .select("id, status, output_path, lead_id, generation_request_id")
      .eq("runpod_job_id", runpodId)
      .maybeSingle();
    if (gen?.id) {
      // Fix 2: terminal-state jobs (cancelled/failed) are immutable from late
      // RunPod callbacks. Log the late callback and return without mutating
      // generation_jobs, posts, generation_outputs, or leads.
      const currentStatus = gen.status as GenerationJobStatus;
      if (currentStatus === "cancelled" || currentStatus === "failed") {
        await logJobEvent({
          jobType: "generation",
          jobId: gen.id as string,
          event: "callback_received",
          message: `Late COMPLETED callback ignored — job already ${currentStatus}`,
          meta: { runpod_job_id: runpodId },
        });
        return NextResponse.json({ ok: true, ignored: currentStatus });
      }

      const out = body.output && typeof body.output === "object" ? (body.output as { output_path?: string }) : null;
      const outputPath = out?.output_path ?? (gen.output_path as string | null) ?? null;
      if (outputPath && currentStatus !== "completed") {
        // Atomic dedup claim before any mutation — race-safe via UNIQUE partial index
        const claimed = await claimCallbackProcessing("generation", gen.id as string, "completed", {
          runpod_job_id: runpodId,
          output_path: outputPath,
        });
        if (!claimed) {
          return NextResponse.json({ ok: true, duplicate: true });
        }

        await admin
          .from("generation_jobs")
          .update({ status: "completed" as GenerationJobStatus, output_path: outputPath })
          .eq("id", gen.id);

        await logJobEvent({
          jobType: "generation",
          jobId: gen.id as string,
          event: "completed",
          message: "Completed via RunPod webhook",
          meta: { runpod_job_id: runpodId, output_path: outputPath },
        });
      }
      const leadId = (gen as { lead_id?: string | null }).lead_id;
      if (leadId && outputPath) {
        await admin
          .from("leads")
          .update({
            sample_asset_path: outputPath,
            status: "sample_generated" as LeadStatus,
            updated_at: new Date().toISOString(),
          })
          .eq("id", leadId);
        await admin.from("automation_events").insert({
          event_type: "sample_generated",
          entity_type: "lead",
          entity_id: leadId,
          payload_json: { generation_job_id: gen.id, output_path: outputPath },
        });
      }
      // Always roll up the parent generation_request when the worker reports a
      // completed generation, even if the row was already PATCHed to "completed"
      // by the worker's internal update before the RunPod COMPLETED webhook
      // fires. syncCustomerRequestState is idempotent (ensurePost / createGenerationOutput
      // both dedupe), so it is safe to call on duplicate webhooks.
      const requestId = (gen as { generation_request_id?: string | null }).generation_request_id ?? null;
      if (requestId) {
        await syncCustomerRequestState(admin, requestId);
      }
      return NextResponse.json({ ok: true, updated: "generation_job" });
    }
  }

  return NextResponse.json({ ok: true });
}
