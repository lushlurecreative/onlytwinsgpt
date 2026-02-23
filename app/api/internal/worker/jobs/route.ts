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

  // Record worker heartbeat for global health (ignore errors if table missing)
  try {
    await admin.from("system_events").insert({ event_type: "worker_heartbeat", payload: {} });
  } catch {
    // Ignore (e.g. system_events table not yet migrated)
  }

  // Only return jobs not yet dispatched to RunPod Serverless (runpod_job_id is null)
  const [trainingRes, generationRes] = await Promise.all([
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
      .order("created_at", { ascending: true })
      .limit(50),
  ]);

  const training = (trainingRes.data ?? []) as Array<{
    id: string;
    subject_id: string;
    sample_paths: string[];
    status: string;
  }>;
  const generation = (generationRes.data ?? []) as Array<{
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
