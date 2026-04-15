/**
 * Job Events: centralised lifecycle event logger for System 4.
 *
 * All major state transitions for training, generation, identity_model,
 * and photo_validation jobs are logged here. Also used for RunPod
 * callback deduplication.
 */

import { getSupabaseAdmin } from "@/lib/supabase-admin";

export type JobType =
  | "training"
  | "generation"
  | "generation_request"
  | "identity_model"
  | "photo_validation";

export type JobEventName =
  | "created"
  | "dispatched"
  | "running"
  | "completed"
  | "failed"
  | "cancelled"
  | "retried"
  | "reaped"
  | "refunded"
  | "callback_received"
  | "callback_duplicate"
  | "status_change"
  | "intake_report";

export type LogJobEventInput = {
  jobType: JobType;
  jobId: string;
  event: JobEventName;
  message?: string | null;
  meta?: Record<string, unknown>;
};

/**
 * Log a job lifecycle event. Fire-and-forget — never throws.
 */
export async function logJobEvent(input: LogJobEventInput): Promise<void> {
  try {
    const admin = getSupabaseAdmin();
    await admin.from("job_events").insert({
      job_type: input.jobType,
      job_id: input.jobId,
      event: input.event,
      message: input.message ?? null,
      meta_json: input.meta ?? {},
    });
  } catch {
    // Fire-and-forget: never block caller
  }
}

/**
 * Log multiple job events in a single insert. Fire-and-forget.
 */
export async function logJobEvents(inputs: LogJobEventInput[]): Promise<void> {
  if (inputs.length === 0) return;
  try {
    const admin = getSupabaseAdmin();
    await admin.from("job_events").insert(
      inputs.map((input) => ({
        job_type: input.jobType,
        job_id: input.jobId,
        event: input.event,
        message: input.message ?? null,
        meta_json: input.meta ?? {},
      }))
    );
  } catch {
    // Fire-and-forget
  }
}

/**
 * Atomically claim the right to process a terminal callback for a given
 * internal job ID + event ("completed"|"failed"). Backed by the UNIQUE
 * partial index `job_events_dedup_idx` (migration 202604070001).
 *
 * Returns true if this caller successfully claimed the slot (caller should
 * proceed and process the callback). Returns false if a prior caller
 * already claimed it (caller should treat as duplicate and skip).
 *
 * This replaces the previous read-then-write check, which races: two
 * concurrent callbacks could both pass the SELECT and both proceed. The
 * unique index makes the second INSERT a no-op via ON CONFLICT DO NOTHING.
 *
 * Note: jobType MUST be "training" or "generation" — the unique index is
 * partial and only covers those two job types for terminal events.
 */
export async function claimCallbackProcessing(
  jobType: "training" | "generation",
  internalJobId: string,
  terminalEvent: "completed" | "failed",
  meta?: Record<string, unknown>
): Promise<boolean> {
  try {
    const admin = getSupabaseAdmin();
    const { data, error } = await admin
      .from("job_events")
      .insert({
        job_type: jobType,
        job_id: internalJobId,
        event: terminalEvent,
        message: "callback claim",
        meta_json: meta ?? {},
      })
      .select("id");
    if (error) {
      // Unique-violation (23505) means another caller claimed first → duplicate.
      // Any other error: be safe and report duplicate so we don't double-process.
      return false;
    }
    return Array.isArray(data) && data.length > 0;
  } catch {
    return false;
  }
}

/**
 * Get recent events for a specific job.
 */
export async function getEventsForJob(
  jobType: JobType,
  jobId: string,
  limit = 50
): Promise<Array<{
  id: string;
  event: string;
  message: string | null;
  meta_json: Record<string, unknown>;
  created_at: string;
}>> {
  const admin = getSupabaseAdmin();
  const { data } = await admin
    .from("job_events")
    .select("id, event, message, meta_json, created_at")
    .eq("job_type", jobType)
    .eq("job_id", jobId)
    .order("created_at", { ascending: false })
    .limit(limit);
  return (data ?? []) as Array<{
    id: string;
    event: string;
    message: string | null;
    meta_json: Record<string, unknown>;
    created_at: string;
  }>;
}
