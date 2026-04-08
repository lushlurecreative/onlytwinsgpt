/**
 * Generation outputs: CRUD for per-output metadata records.
 * Each output maps to a single file produced by a generation job.
 */

import { getSupabaseAdmin } from "@/lib/supabase-admin";

export type GenerationOutput = {
  id: string;
  generation_request_id: string | null;
  generation_job_id: string | null;
  user_id: string;
  output_type: "image" | "video" | "thumbnail";
  storage_path: string;
  width: number | null;
  height: number | null;
  duration_seconds: number | null;
  file_size: number | null;
  is_watermarked: boolean;
  created_at: string;
};

export type CreateOutputInput = {
  generation_request_id?: string | null;
  generation_job_id?: string | null;
  user_id: string;
  output_type: "image" | "video" | "thumbnail";
  storage_path: string;
  width?: number | null;
  height?: number | null;
  duration_seconds?: number | null;
  file_size?: number | null;
  is_watermarked?: boolean;
};

/**
 * Create a generation output record. Idempotent on (user_id, storage_path).
 */
export async function createGenerationOutput(
  input: CreateOutputInput
): Promise<GenerationOutput | null> {
  const admin = getSupabaseAdmin();
  const { data, error } = await admin
    .from("generation_outputs")
    .upsert(
      {
        generation_request_id: input.generation_request_id ?? null,
        generation_job_id: input.generation_job_id ?? null,
        user_id: input.user_id,
        output_type: input.output_type,
        storage_path: input.storage_path,
        width: input.width ?? null,
        height: input.height ?? null,
        duration_seconds: input.duration_seconds ?? null,
        file_size: input.file_size ?? null,
        is_watermarked: input.is_watermarked ?? false,
      },
      { onConflict: "user_id,storage_path" }
    )
    .select()
    .maybeSingle();
  if (error || !data) return null;
  return data as GenerationOutput;
}

/**
 * Get all outputs for a generation request, ordered by creation time.
 */
export async function getOutputsForRequest(
  requestId: string
): Promise<GenerationOutput[]> {
  const admin = getSupabaseAdmin();
  const { data } = await admin
    .from("generation_outputs")
    .select("*")
    .eq("generation_request_id", requestId)
    .order("created_at", { ascending: true });
  return (data ?? []) as GenerationOutput[];
}

/**
 * Get all outputs for a user, most recent first.
 */
export async function getOutputsForUser(
  userId: string,
  limit = 100
): Promise<GenerationOutput[]> {
  const admin = getSupabaseAdmin();
  const { data } = await admin
    .from("generation_outputs")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);
  return (data ?? []) as GenerationOutput[];
}

/**
 * Get outputs for a specific generation job.
 */
export async function getOutputsForJob(
  jobId: string
): Promise<GenerationOutput[]> {
  const admin = getSupabaseAdmin();
  const { data } = await admin
    .from("generation_outputs")
    .select("*")
    .eq("generation_job_id", jobId)
    .order("created_at", { ascending: true });
  return (data ?? []) as GenerationOutput[];
}
