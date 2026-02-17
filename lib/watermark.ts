/**
 * Watermark logging and lookup. Actual embed/decode runs in worker (Python).
 * App logs watermark events when worker reports; admin decode looks up by hash.
 */

import { getSupabaseAdmin } from "@/lib/supabase-admin";

export type WatermarkLogInsert = {
  asset_type: "lead_sample" | "paid_output";
  lead_id?: string | null;
  user_id?: string | null;
  generation_job_id?: string | null;
  asset_path: string;
  watermark_hash: string;
  algorithm_version?: string;
  signature_version?: string;
};

export async function logWatermark(entry: WatermarkLogInsert): Promise<boolean> {
  const admin = getSupabaseAdmin();
  const { error } = await admin.from("watermark_logs").insert({
    asset_type: entry.asset_type,
    lead_id: entry.lead_id ?? null,
    user_id: entry.user_id ?? null,
    generation_job_id: entry.generation_job_id ?? null,
    asset_path: entry.asset_path,
    watermark_hash: entry.watermark_hash,
    algorithm_version: entry.algorithm_version ?? "1",
    signature_version: entry.signature_version ?? "1",
  });
  return !error;
}

export async function getWatermarkByHash(watermark_hash: string): Promise<{
  id: string;
  asset_type: string;
  lead_id: string | null;
  user_id: string | null;
  generation_job_id: string | null;
  asset_path: string;
  embedded_at: string;
} | null> {
  const admin = getSupabaseAdmin();
  const { data, error } = await admin
    .from("watermark_logs")
    .select("id, asset_type, lead_id, user_id, generation_job_id, asset_path, embedded_at")
    .eq("watermark_hash", watermark_hash)
    .limit(1)
    .maybeSingle();
  if (error || !data) return null;
  return data as {
    id: string;
    asset_type: string;
    lead_id: string | null;
    user_id: string | null;
    generation_job_id: string | null;
    asset_path: string;
    embedded_at: string;
  };
}

/** Look up by prefix (e.g. 32-char decoded from image). */
export async function getWatermarkByHashPrefix(prefix: string): Promise<{
  id: string;
  asset_type: string;
  lead_id: string | null;
  user_id: string | null;
  generation_job_id: string | null;
  asset_path: string;
  embedded_at: string;
} | null> {
  const admin = getSupabaseAdmin();
  const { data, error } = await admin
    .from("watermark_logs")
    .select("id, asset_type, lead_id, user_id, generation_job_id, asset_path, embedded_at")
    .like("watermark_hash", `${prefix}%`)
    .limit(1)
    .maybeSingle();
  if (error || !data) return null;
  return data as {
    id: string;
    asset_type: string;
    lead_id: string | null;
    user_id: string | null;
    generation_job_id: string | null;
    asset_path: string;
    embedded_at: string;
  };
}

/** Build payload object for worker (worker will serialize, encrypt, HMAC, embed). */
export function buildWatermarkPayload(params: {
  asset_type: "lead_sample" | "paid_output";
  lead_id?: string | null;
  user_id?: string | null;
  generation_job_id: string;
  campaign_id?: string | null;
}): Record<string, unknown> {
  return {
    asset_type: params.asset_type,
    lead_id: params.lead_id ?? null,
    user_id: params.user_id ?? null,
    generation_job_id: params.generation_job_id,
    campaign_id: params.campaign_id ?? null,
    timestamp_unix: Math.floor(Date.now() / 1000),
    nonce: crypto.randomUUID(),
  };
}
