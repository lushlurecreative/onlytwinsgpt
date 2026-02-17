import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { getApprovedSubjectIdForUser } from "@/lib/generation-jobs";
import { dispatchTrainingJobToRunPod } from "@/lib/runpod";

const MIN_PHOTOS = 30;
const MAX_PHOTOS = 60;

/**
 * POST: Create a training job for the current user when they have 30-60 photos and an approved subject.
 * Sample paths are taken from posts (creator_id = user) in uploads. One training job per subject;
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
      { error: "No approved subject. Create a subject and have consent approved before training." },
      { status: 400 }
    );
  }

  const admin = getSupabaseAdmin();

  const { data: posts, error: postsError } = await admin
    .from("posts")
    .select("storage_path")
    .eq("creator_id", user.id)
    .order("created_at", { ascending: false })
    .limit(MAX_PHOTOS);

  if (postsError) {
    return NextResponse.json({ error: postsError.message }, { status: 400 });
  }
  const samplePaths = (posts ?? []).map((p: { storage_path: string }) => p.storage_path).filter(Boolean);
  if (samplePaths.length < MIN_PHOTOS) {
    return NextResponse.json(
      { error: `At least ${MIN_PHOTOS} photos required (vault/posts). You have ${samplePaths.length}.` },
      { status: 400 }
    );
  }
  const pathsToUse = samplePaths.slice(0, MAX_PHOTOS);

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
