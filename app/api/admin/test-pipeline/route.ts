import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { isAdminUser } from "@/lib/admin";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { getRunPodMode } from "@/lib/runpod";
import { createGenerationJob, getApprovedSubjectIdForUser, getLoraReferenceForSubject } from "@/lib/generation-jobs";
import { getActiveModelForUser } from "@/lib/identity-models";

/**
 * POST /api/admin/test-pipeline
 *
 * Admin-only endpoint to test the generation pipeline in mock, cheap, or production mode.
 * Creates a single generation job and traces the full pipeline lifecycle.
 *
 * Query params:
 *   user_id  — target user (required, must have approved subject + active model)
 *   preset   — scene preset key (default: "beach")
 *
 * The RUNPOD_MODE env var controls dispatch behavior:
 *   mock       — no GPU, simulates full lifecycle locally
 *   cheap      — real GPU, minimal params
 *   production — real GPU, full quality
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isAdminUser(user.id, user.email)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const targetUserId = searchParams.get("user_id")?.trim();
  const presetKey = searchParams.get("preset")?.trim() || "beach";
  const mode = getRunPodMode();

  const admin = getSupabaseAdmin();
  const trace: Array<{ step: string; data: unknown; ms: number }> = [];
  const t0 = Date.now();

  function log(step: string, data: unknown) {
    trace.push({ step, data, ms: Date.now() - t0 });
  }

  log("config", { mode, targetUserId, presetKey });

  // ── Resolve target user ──
  let userId = targetUserId;
  if (!userId) {
    // Default to admin user's own account
    userId = user.id;
  }

  // ── Resolve subject ──
  const subjectId = await getApprovedSubjectIdForUser(userId);
  log("subject_resolution", { subjectId: subjectId ?? "NOT_FOUND" });
  if (!subjectId) {
    return NextResponse.json({
      error: "No approved subject found for target user",
      trace,
    }, { status: 400 });
  }

  // ── Resolve active model / LoRA ──
  const activeModel = await getActiveModelForUser(userId);
  log("active_model", activeModel ? {
    id: activeModel.id,
    version: activeModel.version,
    status: activeModel.status,
    model_path: activeModel.model_path,
    adapter_path: activeModel.adapter_path,
  } : "NOT_FOUND");

  const loraRef = await getLoraReferenceForSubject(subjectId);
  log("lora_reference", { loraRef: loraRef ?? "NOT_FOUND" });

  // ── Resolve preset ──
  const { getScenePresetByKey } = await import("@/lib/scene-presets");
  const preset = getScenePresetByKey(presetKey);
  if (!preset) {
    return NextResponse.json({
      error: `Invalid preset key: ${presetKey}`,
      trace,
    }, { status: 400 });
  }

  // Resolve preset ID from DB
  const { data: presetRow } = await admin
    .from("presets")
    .select("id")
    .ilike("name", preset.label)
    .limit(1)
    .maybeSingle();
  const presetId = presetRow?.id as string | null;
  log("preset_resolution", { key: presetKey, label: preset.label, dbPresetId: presetId ?? "NOT_FOUND" });
  if (!presetId) {
    return NextResponse.json({
      error: `Preset "${presetKey}" not found in presets table`,
      trace,
    }, { status: 400 });
  }

  // ── Resolve a reference image ──
  const { data: uploadList } = await admin.storage.from("uploads").list(`${userId}/training`, {
    limit: 1,
    offset: 0,
    sortBy: { column: "created_at", order: "desc" },
  });
  const refImage = (uploadList ?? []).find((obj) => /\.(jpg|jpeg|png|webp)$/i.test(obj.name));
  const refPath = refImage ? `${userId}/training/${refImage.name}` : null;
  log("reference_image", { refPath: refPath ?? "NOT_FOUND" });
  if (!refPath) {
    return NextResponse.json({
      error: "No training images found for target user",
      trace,
    }, { status: 400 });
  }

  // ── Create generation job ──
  log("dispatch_start", { mode });
  const jobId = await createGenerationJob({
    subject_id: subjectId,
    preset_id: presetId,
    reference_image_path: refPath,
    lora_model_reference: loraRef,
    generation_request_id: null,
    job_type: "user",
  });
  log("job_created", { jobId: jobId ?? "FAILED" });

  if (!jobId) {
    return NextResponse.json({
      error: "Failed to create generation job",
      trace,
    }, { status: 500 });
  }

  // ── Read back the job state ──
  const { data: jobRow } = await admin
    .from("generation_jobs")
    .select("id, status, runpod_job_id, output_path, created_at")
    .eq("id", jobId)
    .maybeSingle();
  log("job_state", jobRow);

  // ── In mock mode, wait briefly for the async callback to complete ──
  if (mode === "mock") {
    // Wait up to 5s for the mock callback to fire
    for (let i = 0; i < 10; i++) {
      await new Promise((r) => setTimeout(r, 500));
      const { data: updated } = await admin
        .from("generation_jobs")
        .select("id, status, runpod_job_id, output_path")
        .eq("id", jobId)
        .maybeSingle();
      if (updated?.status === "completed" || updated?.status === "failed") {
        log("mock_callback_result", updated);
        break;
      }
      if (i === 9) {
        log("mock_callback_timeout", { waited_ms: 5000 });
      }
    }

    // Check for post creation
    const { data: posts } = await admin
      .from("posts")
      .select("id, storage_path, created_at")
      .eq("creator_id", userId)
      .order("created_at", { ascending: false })
      .limit(3);
    log("posts_check", posts);

    // Check for generation_output creation
    const { data: outputs } = await admin
      .from("generation_outputs")
      .select("id, storage_path, output_type, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(3);
    log("generation_outputs_check", outputs);

    // Check job_events
    const { data: events } = await admin
      .from("job_events")
      .select("event, message, created_at")
      .eq("job_id", jobId)
      .order("created_at", { ascending: true });
    log("job_events", events);
  }

  return NextResponse.json({
    ok: true,
    mode,
    jobId,
    trace,
  }, { status: 200 });
}

/**
 * GET /api/admin/test-pipeline?job_id=xxx
 *
 * Check the current state of a test pipeline job.
 */
export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isAdminUser(user.id, user.email)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const jobId = searchParams.get("job_id")?.trim();
  if (!jobId) {
    return NextResponse.json({ error: "job_id required" }, { status: 400 });
  }

  const admin = getSupabaseAdmin();

  const { data: job } = await admin
    .from("generation_jobs")
    .select("id, status, runpod_job_id, output_path, failure_reason, created_at, updated_at")
    .eq("id", jobId)
    .maybeSingle();

  const { data: events } = await admin
    .from("job_events")
    .select("event, message, meta_json, created_at")
    .eq("job_id", jobId)
    .order("created_at", { ascending: true });

  let output: unknown = null;
  if (job?.output_path) {
    const { data: outputRow } = await admin
      .from("generation_outputs")
      .select("id, output_type, storage_path, created_at")
      .eq("storage_path", job.output_path as string)
      .maybeSingle();
    output = outputRow;
  }

  return NextResponse.json({
    job,
    events,
    output,
    mode: getRunPodMode(),
  });
}
