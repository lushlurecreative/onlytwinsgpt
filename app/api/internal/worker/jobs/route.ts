import { NextResponse } from "next/server";
import { requireWorkerSecret } from "@/lib/worker-auth";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import type { GenerationJobStatus } from "@/lib/db-enums";

/**
 * GET: List pending training_jobs and generation_jobs for the worker.
 * Protected by WORKER_SECRET (Bearer or X-Worker-Secret).
 * Worker uses service role only; never anon.
 */
export async function GET(request: Request) {
  if (!requireWorkerSecret(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = getSupabaseAdmin();
  const workerId = request.headers.get("x-worker-id")?.trim() || `worker-${crypto.randomUUID()}`;
  const leaseSeconds = Math.max(30, Math.min(600, Number(request.headers.get("x-lease-seconds") || "120")));
  const leaseUntilIso = new Date(Date.now() + leaseSeconds * 1000).toISOString();

  // Record worker heartbeat for global health (ignore errors if table missing)
  try {
    await admin.from("system_events").insert({ event_type: "worker_heartbeat", payload: {} });
  } catch {
    // Ignore (e.g. system_events table not yet migrated)
  }

  // Only return jobs not yet dispatched to RunPod Serverless (runpod_job_id is null)
  const [trainingRes, generationCandidatesRes] = await Promise.all([
    admin
      .from("training_jobs")
      .select("id, subject_id, sample_paths, status")
      .eq("status", "pending")
      .is("runpod_job_id", null)
      .order("created_at", { ascending: true })
      .limit(50),
    admin
      .from("generation_jobs")
      .select("id, subject_id, preset_id, reference_image_path, lora_model_reference, controlnet_input_path, status, job_type, lead_id")
      .eq("status", "pending")
      .is("runpod_job_id", null)
      .or("lease_until.is.null,lease_until.lt.now()")
      .order("created_at", { ascending: true })
      .limit(50),
  ]);

  const training = (trainingRes.data ?? []) as Array<{
    id: string;
    subject_id: string;
    sample_paths: string[];
    status: string;
  }>;
  const generationCandidateRows = (generationCandidatesRes.data ?? []) as Array<{
    id: string;
    subject_id: string | null;
    preset_id: string;
    reference_image_path: string;
    lora_model_reference: string | null;
    controlnet_input_path: string | null;
    status: GenerationJobStatus;
    job_type: string;
    lead_id: string | null;
  }>;
  const candidateIds = generationCandidateRows.map((row) => row.id);
  if (candidateIds.length > 0) {
    await admin
      .from("generation_jobs")
      .update({ lease_owner: workerId, lease_until: leaseUntilIso })
      .in("id", candidateIds)
      .eq("status", "pending")
      .is("runpod_job_id", null);
  }
  const { data: claimedRows } = await admin
    .from("generation_jobs")
    .select("id, subject_id, preset_id, reference_image_path, lora_model_reference, controlnet_input_path, status, job_type, lead_id")
    .eq("status", "pending")
    .is("runpod_job_id", null)
    .eq("lease_owner", workerId)
    .gte("lease_until", new Date().toISOString())
    .order("created_at", { ascending: true })
    .limit(50);
  const generation = (claimedRows ?? []) as Array<{
    id: string;
    subject_id: string | null;
    preset_id: string;
    reference_image_path: string;
    lora_model_reference: string | null;
    controlnet_input_path: string | null;
    status: GenerationJobStatus;
    job_type: string;
    lead_id: string | null;
  }>;

  return NextResponse.json({
    training_jobs: training,
    generation_jobs: generation,
  });
}
