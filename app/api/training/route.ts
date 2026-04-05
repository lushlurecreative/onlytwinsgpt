import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { getApprovedSubjectIdForUser } from "@/lib/generation-jobs";
import { dispatchTrainingJobToRunPod } from "@/lib/runpod";
import {
  getPhotoSet,
  getPhotosInSet,
  assessReadiness,
  getTrainablePathsFromSet,
  updatePhotoSetStatus,
} from "@/lib/training-photo-sets";
import { createModelRecord, updateModelStatus } from "@/lib/identity-models";

const MIN_PHOTOS = 10;
const MAX_PHOTOS = 50;

/**
 * POST: Create a training job for the current user.
 *
 * Accepts optional `photoSetId` in the request body.
 * - If provided: validates the photo set is ready and uses its trainable paths.
 * - If not provided: falls back to scanning the uploads bucket (legacy behavior).
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

  const subjectId = await getApprovedSubjectIdForUser(user.id);
  if (!subjectId) {
    return NextResponse.json(
      { error: "No approved subject. Create a subject and have identity approved before training." },
      { status: 400 }
    );
  }

  const admin = getSupabaseAdmin();
  const body = (await request.json().catch(() => ({}))) as { photoSetId?: string };

  let pathsToUse: string[];
  let photoSetId: string | null = null;

  if (body.photoSetId) {
    // --- Photo set path: use validated set ---
    const set = await getPhotoSet(body.photoSetId, user.id);
    if (!set) {
      return NextResponse.json({ error: "Photo set not found" }, { status: 404 });
    }

    if (set.status !== "ready") {
      return NextResponse.json(
        { error: `Photo set is not ready (status: ${set.status}). Validate your photos first.` },
        { status: 400 }
      );
    }

    const photos = await getPhotosInSet(set.id);
    const readiness = assessReadiness(set, photos);
    if (!readiness.isReady) {
      return NextResponse.json(
        { error: "Photo set does not meet readiness criteria", reasons: readiness.reasons },
        { status: 400 }
      );
    }

    pathsToUse = await getTrainablePathsFromSet(set.id);
    photoSetId = set.id;

    if (pathsToUse.length < MIN_PHOTOS) {
      return NextResponse.json(
        { error: `At least ${MIN_PHOTOS} usable photos required. Set has ${pathsToUse.length}.` },
        { status: 400 }
      );
    }
  } else {
    // --- Legacy path: scan uploads bucket ---
    const { data: rootFiles } = await admin.storage.from("uploads").list(user.id, { limit: MAX_PHOTOS });
    const { data: trainingFiles } = await admin.storage.from("uploads").list(`${user.id}/training`, { limit: MAX_PHOTOS });

    const imageExts = /\.(jpg|jpeg|png|webp)$/i;
    const fromRoot = (rootFiles ?? [])
      .filter((f) => f.name && imageExts.test(f.name))
      .map((f) => `${user.id}/${f.name}`);
    const fromTraining = (trainingFiles ?? [])
      .filter((f) => f.name && imageExts.test(f.name))
      .map((f) => `${user.id}/training/${f.name}`);

    pathsToUse = [...fromTraining, ...fromRoot].slice(0, MAX_PHOTOS);

    if (pathsToUse.length < MIN_PHOTOS) {
      return NextResponse.json(
        { error: `At least ${MIN_PHOTOS} training photos required. You have ${pathsToUse.length}. Upload more at Training Photos.` },
        { status: 400 }
      );
    }
  }

  // Check for existing active training job
  const { data: existing } = await admin
    .from("training_jobs")
    .select("id, status")
    .eq("subject_id", subjectId)
    .in("status", ["pending", "running"])
    .limit(1)
    .maybeSingle();

  if (existing) {
    return NextResponse.json(
      { error: "A training job for this subject is already pending or running." },
      { status: 400 }
    );
  }

  // Ensure subjects_models record exists
  const { data: subjectModel } = await admin
    .from("subjects_models")
    .select("id")
    .eq("subject_id", subjectId)
    .maybeSingle();
  if (!subjectModel) {
    await admin.from("subjects_models").insert({ subject_id: subjectId, training_status: "pending" });
  } else {
    await admin
      .from("subjects_models")
      .update({ training_status: "pending", updated_at: new Date().toISOString() })
      .eq("subject_id", subjectId);
  }

  // Create training job
  const { data: job, error: insertError } = await admin
    .from("training_jobs")
    .insert({
      subject_id: subjectId,
      status: "pending",
      sample_paths: pathsToUse,
      photo_set_id: photoSetId,
    })
    .select("id, subject_id, status, created_at")
    .single();

  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 400 });
  }

  // Update photo set status to training
  if (photoSetId) {
    await updatePhotoSetStatus(photoSetId, "training");
  }

  // Create identity_model record for this training run
  const identityModel = await createModelRecord({
    user_id: user.id,
    subject_id: subjectId,
    photo_set_id: photoSetId,
    training_job_id: job.id,
  });

  // Dispatch to RunPod
  const runpodJobId = await dispatchTrainingJobToRunPod(
    job.id,
    job.subject_id,
    pathsToUse
  );
  if (runpodJobId) {
    await admin
      .from("training_jobs")
      .update({ runpod_job_id: runpodJobId })
      .eq("id", job.id);
    // Mark model as training (dispatched)
    if (identityModel) {
      await updateModelStatus(identityModel.id, "training", {
        started_at: new Date().toISOString(),
      });
    }
  }

  return NextResponse.json(
    { job, model_id: identityModel?.id ?? null, runpod_dispatched: !!runpodJobId },
    { status: 201 }
  );
}
