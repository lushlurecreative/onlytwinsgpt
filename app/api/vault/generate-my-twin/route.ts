import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { getScenePresetByKey } from "@/lib/scene-presets";
import { isUserSuspended } from "@/lib/suspend";
import {
  getApprovedSubjectIdForUser,
  getPresetIdBySceneKey,
  getLoraReferenceForSubject,
} from "@/lib/generation-jobs";
import { dispatchTrainingJobToRunPod } from "@/lib/runpod";
import { sendAlert } from "@/lib/observability";

const MIN_PHOTOS_TRAINING = 30;
const MAX_PHOTOS_TRAINING = 60;
const MIN_SAMPLE_PATHS = 10;
const MAX_SAMPLE_PATHS = 20;

type Body = {
  sceneCounts?: Record<string, number>;
  contentMode?: "sfw" | "mature";
  videoCount?: number;
};

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const admin = getSupabaseAdmin();
  if (await isUserSuspended(admin, user.id)) {
    return NextResponse.json({ error: "Account access is suspended." }, { status: 403 });
  }

  let body: Body = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const sceneCounts = body.sceneCounts ?? { beach: 45 };
  const contentMode = body.contentMode === "mature" ? "mature" : "sfw";
  const videoCount = Math.max(0, Math.min(20, Number(body.videoCount ?? 0)));

  const subjectId = await getApprovedSubjectIdForUser(user.id);
  if (!subjectId) {
    return NextResponse.json(
      { error: "Complete consent and subject approval before generating. Go to Digital twin & consent." },
      { status: 400 }
    );
  }

  const { data: posts } = await admin
    .from("posts")
    .select("storage_path")
    .eq("creator_id", user.id)
    .order("created_at", { ascending: false })
    .limit(MAX_PHOTOS_TRAINING);
  const allPaths = (posts ?? []).map((p: { storage_path: string }) => p.storage_path).filter(Boolean);

  if (allPaths.length < MIN_SAMPLE_PATHS) {
    return NextResponse.json(
      { error: `Upload at least ${MIN_SAMPLE_PATHS} training photos in the vault. You have ${allPaths.length}.` },
      { status: 400 }
    );
  }
  const samplePaths = allPaths.slice(0, MAX_SAMPLE_PATHS);

  const loraRef = await getLoraReferenceForSubject(subjectId);
  const needsTraining = !loraRef;
  if (needsTraining && allPaths.length < MIN_PHOTOS_TRAINING) {
    return NextResponse.json(
      { error: `At least ${MIN_PHOTOS_TRAINING} photos required to start training. You have ${allPaths.length}.` },
      { status: 400 }
    );
  }

  if (needsTraining) {
    const pathsToUse = allPaths.slice(0, MAX_PHOTOS_TRAINING);
    const { data: existing } = await admin
      .from("training_jobs")
      .select("id")
      .eq("subject_id", subjectId)
      .in("status", ["pending", "running"])
      .limit(1)
      .maybeSingle();
    if (!existing) {
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
      const { data: job, error: jobErr } = await admin
        .from("training_jobs")
        .insert({ subject_id: subjectId, status: "pending", sample_paths: pathsToUse })
        .select("id")
        .single();
      if (!jobErr && job?.id) {
        const runpodJobId = await dispatchTrainingJobToRunPod(job.id, subjectId, pathsToUse);
        if (runpodJobId) {
          await admin.from("training_jobs").update({ runpod_job_id: runpodJobId }).eq("id", job.id);
        }
      }
    }
  }

  const requestIds: string[] = [];
  const sceneKeys = Object.keys(sceneCounts).filter((k) => Number(sceneCounts[k]) > 0);
  for (const sceneKey of sceneKeys) {
    const scene = getScenePresetByKey(sceneKey);
    if (!scene) continue;
    const imageCount = Math.max(1, Math.min(250, Number(sceneCounts[sceneKey]) ?? 45));
    const { data: req, error: reqErr } = await admin
      .from("generation_requests")
      .insert({
        user_id: user.id,
        sample_paths: samplePaths,
        scene_preset: scene.key,
        image_count: imageCount,
        video_count: videoCount,
        content_mode: contentMode,
        status: "pending",
        progress_done: 0,
        progress_total: imageCount + videoCount,
      })
      .select("id")
      .single();
    if (!reqErr && req?.id) {
      requestIds.push(req.id);
      await sendAlert("generation_request_submitted", {
        request_id: req.id,
        user_id: user.id,
        scene: scene.key,
        content_mode: contentMode,
        image_count: imageCount,
        video_count: videoCount,
      });
    }
  }

  if (requestIds.length === 0) {
    return NextResponse.json(
      { error: "No valid scenes with count > 0. Choose at least one scene and quantity." },
      { status: 400 }
    );
  }

  return NextResponse.json(
    {
      ok: true,
      message: needsTraining
        ? "Training started and generation requests submitted. We'll notify you when your vault is ready."
        : "Generation requests submitted. We'll notify you when your vault is ready.",
      training_started: needsTraining,
      request_ids: requestIds,
    },
    { status: 201 }
  );
}
