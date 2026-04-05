/**
 * Identity Models: versioned model registry for trained LoRA models.
 *
 * Each training run creates a new version. Only one model per user can be active.
 * Replaces the flat subjects_models lookup for model resolution.
 */

import { getSupabaseAdmin } from "@/lib/supabase-admin";

// ── Types ──────────────────────────────────────────────────────

export type IdentityModelStatus = "queued" | "training" | "ready" | "failed" | "archived";

export type IdentityModel = {
  id: string;
  user_id: string;
  subject_id: string;
  photo_set_id: string | null;
  training_job_id: string | null;
  version: number;
  status: IdentityModelStatus;
  is_active: boolean;
  trigger_word: string | null;
  base_model: string | null;
  training_backend: string | null;
  model_path: string | null;
  adapter_path: string | null;
  preview_image_path: string | null;
  training_steps: number | null;
  network_dim: number | null;
  network_alpha: number | null;
  learning_rate: number | null;
  caption_strategy: string | null;
  started_at: string | null;
  completed_at: string | null;
  failure_reason: string | null;
  created_at: string;
  updated_at: string;
};

export type CreateModelInput = {
  user_id: string;
  subject_id: string;
  photo_set_id?: string | null;
  training_job_id?: string | null;
  trigger_word?: string | null;
  base_model?: string;
  training_backend?: string;
};

export type CompleteModelInput = {
  model_path?: string | null;
  adapter_path?: string | null;
  preview_image_path?: string | null;
  training_steps?: number | null;
  network_dim?: number | null;
  network_alpha?: number | null;
  learning_rate?: number | null;
  caption_strategy?: string | null;
};

// ── Helpers ────────────────────────────────────────────────────

const MODEL_COLUMNS = "id, user_id, subject_id, photo_set_id, training_job_id, version, status, is_active, trigger_word, base_model, training_backend, model_path, adapter_path, preview_image_path, training_steps, network_dim, network_alpha, learning_rate, caption_strategy, started_at, completed_at, failure_reason, created_at, updated_at";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function asModel(row: any): IdentityModel {
  return row as IdentityModel;
}

/**
 * Atomically activate a model and deactivate all others for the user.
 * Uses a Postgres RPC to run both updates in a single transaction.
 */
async function atomicActivate(modelId: string, userId: string): Promise<void> {
  const admin = getSupabaseAdmin();
  await admin.rpc("activate_identity_model", {
    p_model_id: modelId,
    p_user_id: userId,
  });
}

// ── Core functions ─────────────────────────────────────────────

/**
 * Create a new model record when a training run begins.
 * Auto-increments version based on existing models for the user.
 */
export async function createModelRecord(input: CreateModelInput): Promise<IdentityModel | null> {
  const admin = getSupabaseAdmin();

  // Determine next version number
  const { data: latest } = await admin
    .from("identity_models")
    .select("version")
    .eq("user_id", input.user_id)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextVersion = ((latest?.version as number) ?? 0) + 1;

  const { data, error } = await admin
    .from("identity_models")
    .insert({
      user_id: input.user_id,
      subject_id: input.subject_id,
      photo_set_id: input.photo_set_id ?? null,
      training_job_id: input.training_job_id ?? null,
      version: nextVersion,
      status: "queued",
      is_active: false,
      trigger_word: input.trigger_word ?? null,
      base_model: input.base_model ?? "FLUX.1-dev",
      training_backend: input.training_backend ?? "runpod",
    })
    .select(MODEL_COLUMNS)
    .single();

  if (error) {
    console.error("createModelRecord error:", error.message);
    return null;
  }
  return asModel(data);
}

/**
 * Update model status through lifecycle.
 */
export async function updateModelStatus(
  modelId: string,
  status: IdentityModelStatus,
  extra?: Partial<Pick<IdentityModel, "started_at" | "completed_at" | "failure_reason">>
): Promise<void> {
  const admin = getSupabaseAdmin();
  const updates: Record<string, unknown> = { status };
  if (extra?.started_at) updates.started_at = extra.started_at;
  if (extra?.completed_at) updates.completed_at = extra.completed_at;
  if (extra?.failure_reason !== undefined) updates.failure_reason = extra.failure_reason;
  await admin.from("identity_models").update(updates).eq("id", modelId);
}

/**
 * Mark a model as ready with artifact metadata, and set it as the active model.
 * Uses atomic RPC to deactivate old + activate new in a single transaction.
 */
export async function completeModel(
  modelId: string,
  artifacts: CompleteModelInput
): Promise<void> {
  const admin = getSupabaseAdmin();

  // Get the model to find the user_id and check if already ready
  const { data: model } = await admin
    .from("identity_models")
    .select("user_id, status")
    .eq("id", modelId)
    .single();
  if (!model) return;

  // Skip if already completed
  if ((model.status as string) === "ready") return;

  const userId = model.user_id as string;

  // Update artifact metadata and mark ready
  const updates: Record<string, unknown> = {
    status: "ready",
    completed_at: new Date().toISOString(),
  };
  if (artifacts.model_path !== undefined) updates.model_path = artifacts.model_path;
  if (artifacts.adapter_path !== undefined) updates.adapter_path = artifacts.adapter_path;
  if (artifacts.preview_image_path !== undefined) updates.preview_image_path = artifacts.preview_image_path;
  if (artifacts.training_steps !== undefined) updates.training_steps = artifacts.training_steps;
  if (artifacts.network_dim !== undefined) updates.network_dim = artifacts.network_dim;
  if (artifacts.network_alpha !== undefined) updates.network_alpha = artifacts.network_alpha;
  if (artifacts.learning_rate !== undefined) updates.learning_rate = artifacts.learning_rate;
  if (artifacts.caption_strategy !== undefined) updates.caption_strategy = artifacts.caption_strategy;

  await admin.from("identity_models").update(updates).eq("id", modelId);

  // Atomically activate this model (deactivates any previous active model)
  await atomicActivate(modelId, userId);
}

/**
 * Mark a model as failed with a reason.
 */
export async function failModel(modelId: string, reason: string): Promise<void> {
  await updateModelStatus(modelId, "failed", { failure_reason: reason });
}

/**
 * Get the active model for a user. Returns null if no active model.
 */
export async function getActiveModelForUser(userId: string): Promise<IdentityModel | null> {
  const admin = getSupabaseAdmin();
  const { data, error } = await admin
    .from("identity_models")
    .select(MODEL_COLUMNS)
    .eq("user_id", userId)
    .eq("is_active", true)
    .eq("status", "ready")
    .limit(1)
    .maybeSingle();
  if (error || !data) return null;
  return asModel(data);
}

/**
 * Set a specific model as the active model for the user.
 * Only ready models can be activated. Uses atomic RPC.
 */
export async function setActiveModel(userId: string, modelId: string): Promise<boolean> {
  const admin = getSupabaseAdmin();

  // Verify model exists, belongs to user, and is ready
  const { data: model } = await admin
    .from("identity_models")
    .select("id, user_id, status")
    .eq("id", modelId)
    .eq("user_id", userId)
    .eq("status", "ready")
    .maybeSingle();
  if (!model) return false;

  // Atomically deactivate old + activate new
  await atomicActivate(modelId, userId);
  return true;
}

/**
 * Get all model versions for a user, newest first.
 */
export async function getModelHistory(userId: string): Promise<IdentityModel[]> {
  const admin = getSupabaseAdmin();
  const { data, error } = await admin
    .from("identity_models")
    .select(MODEL_COLUMNS)
    .eq("user_id", userId)
    .order("version", { ascending: false })
    .limit(20);
  if (error || !data) return [];
  return data.map(asModel);
}

/**
 * Get the identity_model linked to a specific training job.
 */
export async function getModelForTrainingJob(trainingJobId: string): Promise<IdentityModel | null> {
  const admin = getSupabaseAdmin();
  const { data, error } = await admin
    .from("identity_models")
    .select(MODEL_COLUMNS)
    .eq("training_job_id", trainingJobId)
    .limit(1)
    .maybeSingle();
  if (error || !data) return null;
  return asModel(data);
}
