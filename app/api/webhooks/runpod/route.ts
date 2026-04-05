import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import type { LeadStatus } from "@/lib/db-enums";
import type { GenerationJobStatus } from "@/lib/db-enums";
import { dispatchGenerationJobToRunPod } from "@/lib/runpod";
import { generateVideo } from "@/lib/video-generation";
import { updatePhotoSetStatus } from "@/lib/training-photo-sets";
import { getModelForTrainingJob, completeModel, failModel, updateModelStatus } from "@/lib/identity-models";

async function ensurePost(admin: ReturnType<typeof getSupabaseAdmin>, userId: string, path: string, caption: string) {
  const { data: existing } = await admin
    .from("posts")
    .select("id")
    .eq("creator_id", userId)
    .eq("storage_path", path)
    .limit(1)
    .maybeSingle();
  if (existing?.id) return;
  await admin.from("posts").insert({
    creator_id: userId,
    storage_path: path,
    caption,
    visibility: "subscribers",
    is_published: false,
  });
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
    .select("status,output_path")
    .eq("generation_request_id", requestId);
  const rows = (jobs ?? []) as Array<{ status: GenerationJobStatus; output_path?: string | null }>;
  const completed = rows.filter((row) => row.status === "completed");
  const failed = rows.filter((row) => row.status === "failed");
  const inFlight = rows.filter((row) => row.status === "pending" || row.status === "running" || row.status === "upscaling" || row.status === "watermarking");
  const outputPaths = Array.from(
    new Set([
      ...((request.output_paths ?? []) as string[]),
      ...completed.map((row) => row.output_path).filter(Boolean) as string[],
    ])
  );
  const caption = `OnlyTwins ${request.scene_preset} set (${(request.content_mode ?? "sfw").toUpperCase()})`;
  for (const outputPath of outputPaths) {
    await ensurePost(admin, request.user_id, outputPath, caption);
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
    await admin
      .from("generation_requests")
      .update({
        status: "failed",
        failed_at: new Date().toISOString(),
        progress_done: outputPaths.length,
        progress_total: rows.length + Math.max(0, request.video_count),
        output_paths: outputPaths,
      })
      .eq("id", requestId);
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
      } catch {
        // Keep image outputs even if video generation is not available.
      }
    }
  }

  const finalDone = outputPaths.length;
  const finalTotal = rows.length + Math.max(0, request.video_count);
  const finalStatus = finalDone >= Math.max(1, finalTotal) ? "completed" : "failed";
  await admin
    .from("generation_requests")
    .update({
      status: finalStatus,
      progress_done: finalDone,
      progress_total: finalTotal,
      output_paths: outputPaths,
      completed_at: finalStatus === "completed" ? request.completed_at ?? new Date().toISOString() : null,
      failed_at: finalStatus === "failed" ? new Date().toISOString() : null,
    })
    .eq("id", requestId);
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

  if (status === "FAILED" || status === "TIMED_OUT" || status === "CANCELLED") {
    const errMsg = body.error || status;
    const { data: training } = await admin
      .from("training_jobs")
      .update({ status: "failed", logs: `RunPod: ${errMsg}` })
      .eq("runpod_job_id", runpodId)
      .select("id, photo_set_id")
      .maybeSingle();
    if (training?.id) {
      // Update photo set status if linked
      if ((training as { photo_set_id?: string | null }).photo_set_id) {
        try {
          await updatePhotoSetStatus((training as { photo_set_id: string }).photo_set_id, "failed");
        } catch { /* non-fatal */ }
      }
      // Update identity_model on failure
      try {
        const model = await getModelForTrainingJob(training.id as string);
        if (model) {
          await failModel(model.id, errMsg);
        }
      } catch { /* non-fatal */ }
      return NextResponse.json({ ok: true, updated: "training_job" });
    }
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
          return NextResponse.json({ ok: true, updated: "generation_job_retried" });
        }
      }
      await admin
        .from("generation_jobs")
        .update({ status: "failed" as GenerationJobStatus })
        .eq("id", failedJob.id);
      if (failedJob.generation_request_id) {
        await syncCustomerRequestState(admin, failedJob.generation_request_id);
      }
    }
    return NextResponse.json({ ok: true, updated: "generation_job" });
  }

  if (status === "COMPLETED") {
    const { data: training } = await admin
      .from("training_jobs")
      .select("id, status, photo_set_id")
      .eq("runpod_job_id", runpodId)
      .maybeSingle();
    if (training?.id && training.status !== "completed") {
      await admin
        .from("training_jobs")
        .update({
          status: "completed",
          finished_at: new Date().toISOString(),
          logs: "Completed via RunPod webhook",
        })
        .eq("id", training.id);
      // Update photo set status to trained
      if ((training as { photo_set_id?: string | null }).photo_set_id) {
        try {
          await updatePhotoSetStatus((training as { photo_set_id: string }).photo_set_id, "trained");
        } catch { /* non-fatal */ }
      }
      // Update identity_model — mark ready if worker already set artifacts, else mark training complete
      try {
        const identityModel = await getModelForTrainingJob(training.id as string);
        if (identityModel && identityModel.status !== "ready") {
          // If worker already completed with artifacts, completeModel was already called.
          // If webhook arrives first, just update status to ready (artifacts will come via worker PATCH).
          if (identityModel.model_path) {
            await completeModel(identityModel.id, {});
          } else {
            await updateModelStatus(identityModel.id, "training", {
              completed_at: new Date().toISOString(),
            });
          }
        }
      } catch { /* non-fatal */ }

      // Create user notification for training completion
      const { data: trainingJob } = await admin
        .from("training_jobs")
        .select("subject_id")
        .eq("id", training.id)
        .maybeSingle();
      if (trainingJob?.subject_id) {
        const { data: subject } = await admin
          .from("subjects")
          .select("user_id")
          .eq("id", trainingJob.subject_id)
          .maybeSingle();
        if (subject?.user_id) {
          await admin.from("user_notifications").insert({
            user_id: subject.user_id,
            type: "training_complete",
            payload_json: {
              training_job_id: training.id,
              message: "Your model training is complete. You can now generate images.",
            },
          });
        }
      }
      return NextResponse.json({ ok: true, updated: "training_job" });
    }
    const { data: gen } = await admin
      .from("generation_jobs")
      .select("id, status, output_path, lead_id, generation_request_id")
      .eq("runpod_job_id", runpodId)
      .maybeSingle();
    if (gen?.id) {
      const out = body.output && typeof body.output === "object" ? (body.output as { output_path?: string }) : null;
      const outputPath = out?.output_path ?? (gen.output_path as string | null) ?? null;
      if (outputPath && (gen.status as GenerationJobStatus) !== "completed") {
        await admin
          .from("generation_jobs")
          .update({ status: "completed" as GenerationJobStatus, output_path: outputPath })
          .eq("id", gen.id);
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
      if ((gen.status as GenerationJobStatus) !== "completed" || leadId) {
        const requestId = (gen as { generation_request_id?: string | null }).generation_request_id ?? null;
        if (requestId) {
          await syncCustomerRequestState(admin, requestId);
        }
        return NextResponse.json({ ok: true, updated: "generation_job" });
      }
    }
  }

  return NextResponse.json({ ok: true });
}
