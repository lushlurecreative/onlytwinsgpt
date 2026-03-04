import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

function getCronSecret(): string {
  return process.env.CRON_SECRET?.trim() || "";
}

function isAuthorized(request: Request): boolean {
  const secret = getCronSecret();
  if (!secret) return false;
  const auth = request.headers.get("authorization") || "";
  const bearer = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  return bearer === secret;
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = getSupabaseAdmin();
  const now = new Date();
  const nowIso = now.toISOString();
  const generationMaxMinutes = Number(process.env.JOB_REAPER_GENERATION_MAX_MINUTES || "120");
  const trainingMaxMinutes = Number(process.env.JOB_REAPER_TRAINING_MAX_MINUTES || "240");
  const generationCutoffIso = new Date(now.getTime() - generationMaxMinutes * 60 * 1000).toISOString();
  const trainingCutoffIso = new Date(now.getTime() - trainingMaxMinutes * 60 * 1000).toISOString();

  const { data: staleGeneration } = await admin
    .from("generation_jobs")
    .select("id,status,created_at")
    .in("status", ["running", "upscaling", "watermarking"])
    .lt("created_at", generationCutoffIso)
    .limit(200);

  const staleGenerationIds = (staleGeneration ?? []).map((row) => row.id);
  if (staleGenerationIds.length > 0) {
    await admin.from("generation_jobs").update({ status: "failed" }).in("id", staleGenerationIds);
  }

  const { data: staleTraining } = await admin
    .from("training_jobs")
    .select("id,status,created_at,started_at")
    .eq("status", "running")
    .or(`started_at.lt.${trainingCutoffIso},and(started_at.is.null,created_at.lt.${trainingCutoffIso})`)
    .limit(200);

  const staleTrainingIds = (staleTraining ?? []).map((row) => row.id);
  if (staleTrainingIds.length > 0) {
    await admin
      .from("training_jobs")
      .update({ status: "failed", finished_at: nowIso, logs: "Marked failed by job reaper (stale running job)." })
      .in("id", staleTrainingIds);
  }

  await admin.from("system_events").insert({
    event_type: "job_reaper_run",
    payload: {
      stale_generation_jobs: staleGenerationIds.length,
      stale_training_jobs: staleTrainingIds.length,
      generation_cutoff: generationCutoffIso,
      training_cutoff: trainingCutoffIso,
    },
  });

  return NextResponse.json({
    ok: true,
    stale_generation_jobs: staleGenerationIds.length,
    stale_training_jobs: staleTrainingIds.length,
  });
}
