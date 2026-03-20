import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { getApprovedSubjectIdForUser } from "@/lib/generation-jobs";
import { dispatchTrainingJobToRunPod } from "@/lib/runpod";

const MIN_PHOTOS = 10;
const MAX_PHOTOS = 60;

/**
 * POST: Create a training job for the current user when they have 10–60 uploaded training photos and an approved subject.
 * Photos are read from the uploads bucket (userId/training/ prefix). One training job per subject;
 * if one is already pending/running, returns 400.
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

  // Read training photos from uploads bucket (the dedicated training folder).
  const { data: rootFiles } = await admin.storage.from("uploads").list(user.id, { limit: MAX_PHOTOS });
  const { data: trainingFiles } = await admin.storage.from("uploads").list(`${user.id}/training`, { limit: MAX_PHOTOS });

  const imageExts = /\.(jpg|jpeg|png|webp)$/i;
  const fromRoot = (rootFiles ?? [])
    .filter((f) => f.name && imageExts.test(f.name))
    .map((f) => `${user.id}/${f.name}`);
  const fromTraining = (trainingFiles ?? [])
    .filter((f) => f.name && imageExts.test(f.name))
    .map((f) => `${user.id}/training/${f.name}`);

  const samplePaths = [...fromTraining, ...fromRoot].slice(0, MAX_PHOTOS);

  if (samplePaths.length < MIN_PHOTOS) {
    return NextResponse.json(
      { error: `At least ${MIN_PHOTOS} training photos required. You have ${samplePaths.length}. Upload more at Training Photos.` },
      { status: 400 }
    );
  }
  const pathsToUse = samplePaths;

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

  const { data: job, error: insertError } = await admin
    .from("training_jobs")
    .insert({
      subject_id: subjectId,
      status: "pending",
      sample_paths: pathsToUse,
    })
    .select("id, subject_id, status, created_at")
    .single();

  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 400 });
  }

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
  }

  return NextResponse.json(
    { job, runpod_dispatched: !!runpodJobId },
    { status: 201 }
  );
}
