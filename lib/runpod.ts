/**
 * RunPod Serverless: app submits jobs via API; worker runs on RunPod; webhook receives completion.
 * Config from app_settings (admin UI) or env RUNPOD_API_KEY / RUNPOD_ENDPOINT_ID.
 */

import { getSupabaseAdmin } from "@/lib/supabase-admin";

const RUNPOD_API_BASE = "https://api.runpod.ai/v2";

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
  const config = await getRunPodConfig();
  if (!config) return null;
  const appUrl = getAppUrl();
  const workerSecret = getWorkerSecret();
  if (!appUrl || !workerSecret) return null;
  const webhookUrl = `${appUrl}/api/webhooks/runpod`;
  const result = await submitRunPodJob(
    config,
    {
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
    },
    {
      webhookUrl,
      executionTimeoutMs: 15 * 60 * 1000, // 15 min for generation
    }
  );
  return result?.id ?? null;
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
