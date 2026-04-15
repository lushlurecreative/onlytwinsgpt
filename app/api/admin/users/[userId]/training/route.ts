import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { isAdminUser } from "@/lib/admin";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { dispatchTrainingJobToRunPod } from "@/lib/runpod";
import { createModelRecord, updateModelStatus } from "@/lib/identity-models";
import { MIN_INTAKE_PHOTOS, MAX_INTAKE_PHOTOS } from "@/lib/intake";

type Params = { params: Promise<{ userId: string }> };

const MIN_PHOTOS = MIN_INTAKE_PHOTOS;
const MAX_PHOTOS = MAX_INTAKE_PHOTOS;

/**
 * POST: Admin triggers LoRA training for a customer.
 * Reads their uploads bucket, requires an approved subject, dispatches to RunPod.
 */
export async function POST(_req: Request, { params }: Params) {
  const { userId } = await params;

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

  const admin = getSupabaseAdmin();

  // Get approved subject
  const { data: subject } = await admin
    .from("subjects")
    .select("id")
    .eq("user_id", userId)
    .eq("consent_status", "approved")
    .limit(1)
    .maybeSingle();

  if (!subject) {
    return NextResponse.json(
      { error: "No approved subject found. Create and approve the subject first." },
      { status: 400 }
    );
  }
  const subjectId = subject.id as string;

  // Check for already running training
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

  // Read training photos from uploads bucket
  const { data: rootFiles } = await admin.storage.from("uploads").list(userId, { limit: MAX_PHOTOS });
  const { data: trainingFiles } = await admin.storage
    .from("uploads")
    .list(`${userId}/training`, { limit: MAX_PHOTOS });

  const imageExts = /\.(jpg|jpeg|png|webp)$/i;
  const fromRoot = (rootFiles ?? [])
    .filter((f) => f.name && imageExts.test(f.name))
    .map((f) => `${userId}/${f.name}`);
  const fromTraining = (trainingFiles ?? [])
    .filter((f) => f.name && imageExts.test(f.name))
    .map((f) => `${userId}/training/${f.name}`);

  const samplePaths = [...fromTraining, ...fromRoot].slice(0, MAX_PHOTOS);

  if (samplePaths.length < MIN_PHOTOS) {
    return NextResponse.json(
      {
        error: `At least ${MIN_PHOTOS} training photos required. Found ${samplePaths.length}. Ask the customer to upload more.`,
      },
      { status: 400 }
    );
  }

  // Upsert subjects_models row
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
      sample_paths: samplePaths,
    })
    .select("id, subject_id, status, created_at")
    .single();

  if (insertError || !job) {
    return NextResponse.json({ error: insertError?.message ?? "Failed to create training job" }, { status: 400 });
  }

  // Create identity_model record for this training run
  const identityModel = await createModelRecord({
    user_id: userId,
    subject_id: subjectId,
    training_job_id: job.id,
  });

  const runpodJobId = await dispatchTrainingJobToRunPod(job.id, job.subject_id, samplePaths);
  if (runpodJobId) {
    await admin.from("training_jobs").update({ runpod_job_id: runpodJobId }).eq("id", job.id);
    if (identityModel) {
      await updateModelStatus(identityModel.id, "training", {
        started_at: new Date().toISOString(),
      });
    }
  }

  return NextResponse.json(
    {
      job: { id: job.id, status: job.status, sample_count: samplePaths.length },
      model_id: identityModel?.id ?? null,
      runpod_dispatched: !!runpodJobId,
    },
    { status: 201 }
  );
}
