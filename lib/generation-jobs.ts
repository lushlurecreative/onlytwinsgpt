/**
 * Generation jobs: create job(s), poll until complete.
 * When RunPod Serverless is configured, app dispatches to RunPod automatically; no polling worker needed.
 */

import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { getScenePresetByKey } from "@/lib/scene-presets";
import { dispatchGenerationJobToRunPod } from "@/lib/runpod";

const POLL_INTERVAL_MS = 2000;
const POLL_TIMEOUT_MS = 300_000; // 5 min per job

export type CreateGenerationJobInput = {
  subject_id: string | null;
  preset_id: string;
  reference_image_path: string;
  lora_model_reference?: string | null;
  controlnet_input_path?: string | null;
  generation_request_id?: string | null;
};

export async function getApprovedSubjectIdForUser(userId: string): Promise<string | null> {
  const admin = getSupabaseAdmin();
  const { data, error } = await admin
    .from("subjects")
    .select("id")
    .eq("user_id", userId)
    .eq("consent_status", "approved")
    .limit(1)
    .maybeSingle();
  if (error || !data?.id) return null;
  return data.id as string;
}

export async function getLoraReferenceForSubject(subjectId: string): Promise<string | null> {
  const admin = getSupabaseAdmin();
  const { data, error } = await admin
    .from("subjects_models")
    .select("lora_model_reference")
    .eq("subject_id", subjectId)
    .eq("training_status", "completed")
    .limit(1)
    .maybeSingle();
  if (error || !data?.lora_model_reference) return null;
  return data.lora_model_reference as string;
}

export async function getPresetIdBySceneKey(sceneKey: string): Promise<string | null> {
  const preset = getScenePresetByKey(sceneKey);
  if (!preset) return null;
  const admin = getSupabaseAdmin();
  const { data, error } = await admin
    .from("presets")
    .select("id")
    .ilike("name", preset.label)
    .limit(1)
    .single();
  if (error || !data?.id) return null;
  return data.id as string;
}

export async function createGenerationJob(input: CreateGenerationJobInput): Promise<string | null> {
  const admin = getSupabaseAdmin();
  const { data, error } = await admin
    .from("generation_jobs")
    .insert({
      subject_id: input.subject_id,
      preset_id: input.preset_id,
      reference_image_path: input.reference_image_path,
      lora_model_reference: input.lora_model_reference ?? null,
      controlnet_input_path: input.controlnet_input_path ?? null,
      generation_request_id: input.generation_request_id ?? null,
      status: "pending",
    })
    .select("id")
    .single();
  if (error || !data?.id) return null;
  const jobId = data.id as string;
  const runpodJobId = await dispatchGenerationJobToRunPod(jobId, {
    subject_id: input.subject_id,
    preset_id: input.preset_id,
    reference_image_path: input.reference_image_path,
    lora_model_reference: input.lora_model_reference ?? null,
    controlnet_input_path: input.controlnet_input_path ?? null,
  });
  if (runpodJobId) {
    await admin
      .from("generation_jobs")
      .update({ runpod_job_id: runpodJobId })
      .eq("id", jobId);
  }
  return jobId;
}

export async function getGenerationJobStatus(
  jobId: string
): Promise<{ status: string; output_path: string | null } | null> {
  const admin = getSupabaseAdmin();
  const { data, error } = await admin
    .from("generation_jobs")
    .select("status, output_path")
    .eq("id", jobId)
    .single();
  if (error || !data) return null;
  return { status: data.status as string, output_path: (data.output_path as string) ?? null };
}

export async function pollGenerationJobUntilDone(jobId: string): Promise<{
  ok: boolean;
  output_path: string | null;
  error?: string;
}> {
  const start = Date.now();
  for (;;) {
    const row = await getGenerationJobStatus(jobId);
    if (!row) return { ok: false, output_path: null, error: "Job not found" };
    if (row.status === "completed")
      return { ok: true, output_path: row.output_path };
    if (row.status === "failed")
      return { ok: false, output_path: null, error: "Generation job failed" };
    if (Date.now() - start > POLL_TIMEOUT_MS)
      return { ok: false, output_path: null, error: "Poll timeout" };
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }
}

export async function pollAllGenerationJobsUntilDone(
  jobIds: string[]
): Promise<{ output_paths: string[]; allOk: boolean; firstError?: string }> {
  const output_paths: string[] = [];
  let firstError: string | undefined;
  for (const id of jobIds) {
    const result = await pollGenerationJobUntilDone(id);
    if (result.ok && result.output_path) output_paths.push(result.output_path);
    else if (!firstError) firstError = result.error;
  }
  return {
    output_paths,
    allOk: output_paths.length === jobIds.length,
    firstError,
  };
}
