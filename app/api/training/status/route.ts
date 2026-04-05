import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { getApprovedSubjectIdForUser } from "@/lib/generation-jobs";
import { getActiveModelForUser, getModelHistory } from "@/lib/identity-models";

/**
 * GET: Return the current training status for the authenticated user.
 * Returns the latest training job and subjects_models status.
 */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = getSupabaseAdmin();
  const subjectId = await getApprovedSubjectIdForUser(user.id);

  if (!subjectId) {
    return NextResponse.json({
      hasSubject: false,
      trainingStatus: null,
      latestJob: null,
      modelReady: false,
      activeModel: null,
      modelHistory: [],
    });
  }

  // Get model status
  const { data: model } = await admin
    .from("subjects_models")
    .select("id, training_status, lora_model_reference, updated_at")
    .eq("subject_id", subjectId)
    .maybeSingle();

  // Get latest training job
  const { data: latestJob } = await admin
    .from("training_jobs")
    .select("id, status, started_at, finished_at, created_at, photo_set_id")
    .eq("subject_id", subjectId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  // Get photo set status if linked
  let photoSetStatus: string | null = null;
  if (latestJob?.photo_set_id) {
    const { data: set } = await admin
      .from("training_photo_sets")
      .select("status")
      .eq("id", latestJob.photo_set_id)
      .maybeSingle();
    photoSetStatus = set?.status ?? null;
  }

  // Get identity_model info
  const activeModel = await getActiveModelForUser(user.id);
  const models = await getModelHistory(user.id);

  return NextResponse.json({
    hasSubject: true,
    subjectId,
    trainingStatus: model?.training_status ?? null,
    modelReady:
      !!activeModel ||
      (model?.training_status === "completed" && !!model?.lora_model_reference),
    latestJob: latestJob
      ? {
          id: latestJob.id,
          status: latestJob.status,
          startedAt: latestJob.started_at,
          finishedAt: latestJob.finished_at,
          createdAt: latestJob.created_at,
          photoSetId: latestJob.photo_set_id,
          photoSetStatus,
        }
      : null,
    activeModel: activeModel
      ? {
          id: activeModel.id,
          version: activeModel.version,
          status: activeModel.status,
          baseModel: activeModel.base_model,
          previewImagePath: activeModel.preview_image_path,
          completedAt: activeModel.completed_at,
          trainingSteps: activeModel.training_steps,
        }
      : null,
    modelHistory: models.map((m) => ({
      id: m.id,
      version: m.version,
      status: m.status,
      isActive: m.is_active,
      completedAt: m.completed_at,
      failureReason: m.failure_reason,
      createdAt: m.created_at,
    })),
  });
}
