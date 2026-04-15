/**
 * RunPod Serverless: app submits jobs via API; worker runs on RunPod; webhook receives completion.
 * Config from app_settings (admin UI) or env RUNPOD_API_KEY / RUNPOD_ENDPOINT_ID.
 *
 * Supports three modes via RUNPOD_MODE env var:
 * - "mock"       — no GPU. Simulates full job lifecycle locally for pipeline testing.
 * - "cheap"      — real GPU, minimal params (1 image, 512x512, 4 steps).
 * - "production" — real GPU, full quality. Default.
 */

import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { isGenerationEngineEnabled, logGenerationEngineDisabled } from "@/lib/generation-engine";
import { logJobEvent, claimCallbackProcessing } from "@/lib/job-events";
import { createGenerationOutput } from "@/lib/generation-outputs";

const RUNPOD_API_BASE = "https://api.runpod.ai/v2";

export type RunPodMode = "mock" | "cheap" | "production";

export function getRunPodMode(): RunPodMode {
  const mode = (process.env.RUNPOD_MODE ?? "production").trim().toLowerCase();
  if (mode === "mock" || mode === "cheap") return mode;
  return "production";
}

/** Cheap-mode overrides sent to worker to minimize GPU cost */
export const CHEAP_MODE_OVERRIDES = {
  width: 512,
  height: 512,
  num_inference_steps: 4,
  guidance_scale: 3.0,
  skip_face_swap: true,
  cheap_mode: true,
} as const;

export type RunPodConfig = {
  apiKey: string;
  endpointId: string;
};

export async function getRunPodConfig(): Promise<RunPodConfig | null> {
  const fromEnv =
    process.env.RUNPOD_API_KEY?.trim() && process.env.RUNPOD_ENDPOINT_ID?.trim();
  if (fromEnv) {
    return {
      apiKey: process.env.RUNPOD_API_KEY!.trim(),
      endpointId: process.env.RUNPOD_ENDPOINT_ID!.trim(),
    };
  }
  const admin = getSupabaseAdmin();
  const { data: apiKeyRow } = await admin
    .from("app_settings")
    .select("value")
    .eq("key", "runpod_api_key")
    .maybeSingle();
  const { data: endpointRow } = await admin
    .from("app_settings")
    .select("value")
    .eq("key", "runpod_endpoint_id")
    .maybeSingle();
  const apiKey = (apiKeyRow?.value as string)?.trim();
  const endpointId = (endpointRow?.value as string)?.trim();
  if (!apiKey || !endpointId) return null;
  return { apiKey, endpointId };
}

/** Submit async job to RunPod Serverless. Returns RunPod job id or null. */
export async function submitRunPodJob(
  config: RunPodConfig,
  input: Record<string, unknown>,
  options: { webhookUrl: string; executionTimeoutMs?: number }
): Promise<{ id: string } | null> {
  const body: Record<string, unknown> = {
    input,
    webhook: options.webhookUrl,
  };
  if (options.executionTimeoutMs != null) {
    body.policy = { executionTimeout: options.executionTimeoutMs };
  }
  const res = await fetch(`${RUNPOD_API_BASE}/${config.endpointId}/run`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    console.error("RunPod submit error:", res.status, text);
    return null;
  }
  const data = (await res.json()) as { id?: string; status?: string };
  if (!data.id) return null;
  return { id: data.id };
}

function getAppUrl(): string {
  return (
    process.env.APP_URL?.trim() ||
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    ""
  ).replace(/\/$/, "");
}
function getWorkerSecret(): string {
  return process.env.WORKER_SECRET?.trim() || "";
}

/** Dispatch a training job to RunPod; returns RunPod job id if submitted. */
export async function dispatchTrainingJobToRunPod(
  jobId: string,
  subjectId: string,
  samplePaths: string[]
): Promise<string | null> {
  const config = await getRunPodConfig();
  if (!config) return null;
  const appUrl = getAppUrl();
  const workerSecret = getWorkerSecret();
  if (!appUrl || !workerSecret) return null;
  const webhookUrl = `${appUrl}/api/webhooks/runpod`;
  const result = await submitRunPodJob(
    config,
    {
      type: "training",
      job_id: jobId,
      subject_id: subjectId,
      sample_paths: samplePaths,
      app_url: appUrl,
      worker_secret: workerSecret,
    },
    {
      webhookUrl,
      executionTimeoutMs: 2 * 60 * 60 * 1000, // 2 hours for training
    }
  );
  return result?.id ?? null;
}

/** Dispatch a generation job to RunPod; returns RunPod job id if submitted. */
export async function dispatchGenerationJobToRunPod(
  jobId: string,
  payload: {
    subject_id: string | null;
    preset_id: string;
    reference_image_path: string;
    lora_model_reference?: string | null;
    controlnet_input_path?: string | null;
    job_type?: "user" | "lead_sample";
    lead_id?: string | null;
  }
): Promise<string | null> {
  if (!isGenerationEngineEnabled()) {
    logGenerationEngineDisabled("job_dispatcher_dispatch_runpod");
    return null;
  }

  const mode = getRunPodMode();

  // ── MOCK MODE: simulate dispatch, fire async callback ──
  if (mode === "mock") {
    const mockRunpodId = `mock-${jobId.slice(0, 8)}-${Date.now()}`;
    console.log(`[runpod:mock] Dispatching mock job ${mockRunpodId} for internal job ${jobId}`);
    // Fire mock callback asynchronously after a short delay
    void simulateMockCallback(jobId, mockRunpodId);
    return mockRunpodId;
  }

  const config = await getRunPodConfig();
  if (!config) return null;
  const appUrl = getAppUrl();
  const workerSecret = getWorkerSecret();
  if (!appUrl || !workerSecret) return null;
  const webhookUrl = `${appUrl}/api/webhooks/runpod`;

  // Build input — in cheap mode, merge cost-saving overrides
  const inputPayload: Record<string, unknown> = {
    type: "generation",
    job_id: jobId,
    subject_id: payload.subject_id,
    preset_id: payload.preset_id,
    reference_image_path: payload.reference_image_path,
    lora_model_reference: payload.lora_model_reference ?? null,
    controlnet_input_path: payload.controlnet_input_path ?? null,
    job_type: payload.job_type ?? "user",
    lead_id: payload.lead_id ?? null,
    app_url: appUrl,
    worker_secret: workerSecret,
  };
  if (mode === "cheap") {
    Object.assign(inputPayload, CHEAP_MODE_OVERRIDES);
    console.log(`[runpod:cheap] Dispatching with minimal GPU params for job ${jobId}`);
  }

  const result = await submitRunPodJob(
    config,
    inputPayload,
    {
      webhookUrl,
      executionTimeoutMs: 15 * 60 * 1000, // 15 min for generation
    }
  );
  return result?.id ?? null;
}

/**
 * Mock callback simulator: exercises the full DB state machine without GPU.
 * Runs async — creates a mock output, transitions job states, creates post + output records.
 * Does NOT make HTTP calls — directly applies the same logic as the webhook handler.
 */
async function simulateMockCallback(internalJobId: string, mockRunpodId: string): Promise<void> {
  // Small delay to simulate async processing
  await new Promise((r) => setTimeout(r, 500));

  const admin = getSupabaseAdmin();

  // 1. Mark job as running
  await admin
    .from("generation_jobs")
    .update({ status: "running" })
    .eq("id", internalJobId);
  console.log(`[runpod:mock] Job ${internalJobId} → running`);

  await logJobEvent({
    jobType: "generation",
    jobId: internalJobId,
    event: "running",
    message: "Mock: simulated running state",
    meta: { runpod_job_id: mockRunpodId, mock: true },
  });

  // Brief pause to simulate inference time
  await new Promise((r) => setTimeout(r, 300));

  // 2. Look up the job to get user context
  const { data: job } = await admin
    .from("generation_jobs")
    .select("id, subject_id, generation_request_id, lead_id")
    .eq("id", internalJobId)
    .maybeSingle();
  if (!job) {
    console.error(`[runpod:mock] Job ${internalJobId} not found in DB`);
    return;
  }

  // 3. Resolve user_id from subject for storage path
  let userId = "mock-user";
  if (job.subject_id) {
    const { data: subject } = await admin
      .from("subjects")
      .select("user_id")
      .eq("id", job.subject_id as string)
      .maybeSingle();
    if (subject?.user_id) userId = subject.user_id as string;
  }

  // 4. Create a mock output — upload a 1x1 placeholder PNG to Supabase Storage
  const mockOutputPath = `${userId}/generated/mock-${internalJobId.slice(0, 8)}.png`;
  const PLACEHOLDER_PNG = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
    "base64"
  );
  const { error: uploadError } = await admin.storage
    .from("uploads")
    .upload(mockOutputPath, PLACEHOLDER_PNG, {
      contentType: "image/png",
      upsert: true,
    });
  if (uploadError) {
    console.error(`[runpod:mock] Upload failed for ${mockOutputPath}:`, uploadError.message);
  } else {
    console.log(`[runpod:mock] Uploaded mock output to ${mockOutputPath}`);
  }

  // 5. Atomic dedup claim (same as real webhook handler)
  const claimed = await claimCallbackProcessing("generation", internalJobId, "completed", {
    runpod_job_id: mockRunpodId,
    output_path: mockOutputPath,
    mock: true,
  });
  if (!claimed) {
    console.log(`[runpod:mock] Dedup claim failed for ${internalJobId} — duplicate callback`);
    return;
  }

  // 6. Mark job as completed with output path
  await admin
    .from("generation_jobs")
    .update({
      status: "completed",
      output_path: mockOutputPath,
    })
    .eq("id", internalJobId);
  console.log(`[runpod:mock] Job ${internalJobId} → completed (output: ${mockOutputPath})`);

  await logJobEvent({
    jobType: "generation",
    jobId: internalJobId,
    event: "completed",
    message: "Mock: simulated completion",
    meta: { runpod_job_id: mockRunpodId, output_path: mockOutputPath, mock: true },
  });

  // 7. Create post record (same as webhook handler's ensurePost)
  const { data: existingPost } = await admin
    .from("posts")
    .select("id")
    .eq("creator_id", userId)
    .eq("storage_path", mockOutputPath)
    .limit(1)
    .maybeSingle();
  if (!existingPost) {
    await admin.from("posts").insert({
      creator_id: userId,
      storage_path: mockOutputPath,
      caption: "Mock generation output",
      visibility: "subscribers",
      is_published: false,
      generation_job_id: internalJobId,
    });
    console.log(`[runpod:mock] Post created for ${mockOutputPath}`);
  }

  // 8. Create generation_output record
  await createGenerationOutput({
    generation_request_id: (job.generation_request_id as string) ?? null,
    generation_job_id: internalJobId,
    user_id: userId,
    output_type: "image",
    storage_path: mockOutputPath,
  });
  console.log(`[runpod:mock] Generation output record created`);

  // 9. If part of a generation_request, sync the parent request state
  const requestId = (job.generation_request_id as string) ?? null;
  if (requestId) {
    // Count all jobs for this request
    const { data: allJobs } = await admin
      .from("generation_jobs")
      .select("id, status, output_path")
      .eq("generation_request_id", requestId);
    const rows = (allJobs ?? []) as Array<{ id: string; status: string; output_path?: string | null }>;
    const completedJobs = rows.filter((r) => r.status === "completed");
    const failedJobs = rows.filter((r) => r.status === "failed" || r.status === "cancelled");
    const inFlight = rows.filter((r) => r.status === "pending" || r.status === "running");
    const outputPaths = completedJobs.map((r) => r.output_path).filter(Boolean) as string[];

    if (inFlight.length > 0) {
      await admin.from("generation_requests").update({
        status: "generating",
        progress_done: outputPaths.length,
        progress_total: rows.length,
        output_paths: outputPaths,
      }).eq("id", requestId);
    } else if (completedJobs.length > 0) {
      await admin.from("generation_requests").update({
        status: "completed",
        progress_done: outputPaths.length,
        progress_total: rows.length,
        output_paths: outputPaths,
        completed_at: new Date().toISOString(),
      }).eq("id", requestId);
      console.log(`[runpod:mock] Request ${requestId} → completed`);
    } else if (failedJobs.length === rows.length) {
      await admin.from("generation_requests").update({
        status: "failed",
        failure_reason: "All generation jobs failed (mock)",
        failed_at: new Date().toISOString(),
      }).eq("id", requestId);
    }
  }

  console.log(`[runpod:mock] Mock callback complete for job ${internalJobId}`);
}

/** Check RunPod endpoint health (for admin status). */
export async function getRunPodHealth(
  config: RunPodConfig
): Promise<{ ok: boolean; jobs?: Record<string, number>; error?: string }> {
  try {
    const res = await fetch(`${RUNPOD_API_BASE}/${config.endpointId}/health`, {
      headers: { Authorization: `Bearer ${config.apiKey}` },
    });
    if (!res.ok) {
      return { ok: false, error: `HTTP ${res.status}` };
    }
    const data = (await res.json()) as { jobs?: Record<string, number> };
    return { ok: true, jobs: data.jobs };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: msg };
  }
}
