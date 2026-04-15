import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { getScenePresetByKey } from "@/lib/scene-presets";
import { isUserSuspended } from "@/lib/suspend";
import {
  getApprovedSubjectIdForUser,
  getLoraReferenceForSubject,
} from "@/lib/generation-jobs";
import { dispatchTrainingJobToRunPod } from "@/lib/runpod";
import { sendAlert } from "@/lib/observability";
import { createCanonicalCustomerGenerationBatch } from "@/lib/customer-generation";
import { getCurrentSubscriptionSummary } from "@/lib/request-planner";
import { processPendingCustomerGeneration } from "@/lib/customer-generation-processor";
import { MIN_INTAKE_PHOTOS, MAX_INTAKE_PHOTOS } from "@/lib/intake";

const MIN_PHOTOS_TRAINING = MIN_INTAKE_PHOTOS;
const MAX_PHOTOS_TRAINING = MAX_INTAKE_PHOTOS;
const MIN_SAMPLE_PATHS = MIN_INTAKE_PHOTOS;
const MAX_SAMPLE_PATHS = MAX_INTAKE_PHOTOS;

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

  const sceneKeys = Object.keys(sceneCounts).filter((k) => Number(sceneCounts[k]) > 0);
  const requestLines = sceneKeys.flatMap((sceneKey) => {
    const scene = getScenePresetByKey(sceneKey);
    if (!scene) return [];
    const imageCount = Math.max(1, Math.min(250, Number(sceneCounts[sceneKey]) ?? 45));
    return [
      {
        id: crypto.randomUUID(),
        kind: "photo",
        count: imageCount,
        direction: `${scene.label} ${contentMode === "mature" ? "mature" : "sfw"} set`,
      },
    ];
  });
  if (videoCount > 0 && sceneKeys.length > 0) {
    requestLines.push({
      id: crypto.randomUUID(),
      kind: "video",
      count: videoCount,
      direction: "Short social reel with natural camera movement",
    });
  }
  if (requestLines.length === 0) {
    return NextResponse.json(
      { error: "No valid scenes with count > 0. Choose at least one scene and quantity." },
      { status: 400 }
    );
  }
  const summary = await getCurrentSubscriptionSummary(admin, user.id);
  const cycleEndIso = summary.nextRenewalAt ?? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
  const cycleStartIso = new Date(new Date(cycleEndIso).getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const creation = await createCanonicalCustomerGenerationBatch(admin, {
    userId: user.id,
    rawLines: requestLines,
    samplePaths,
    source: "vault_generate",
    idempotencyKey: `vault-generate:${user.id}:${cycleStartIso.slice(0, 10)}`,
    cycleStartIso,
    cycleEndIso,
  });
  if (!creation.ok) {
    return NextResponse.json({ error: creation.error, code: creation.code }, { status: creation.status });
  }
  await sendAlert("generation_request_submitted", {
    request_id: creation.generationRequestId,
    user_id: user.id,
    scene: sceneKeys.join(","),
    content_mode: contentMode,
    image_count: creation.totals.photos,
    video_count: creation.totals.videos,
  });
  await processPendingCustomerGeneration(admin, 5);

  return NextResponse.json(
    {
      ok: true,
      message: needsTraining
        ? "Training started and generation requests submitted. We'll notify you when your vault is ready."
        : "Generation requests submitted. We'll notify you when your vault is ready.",
      training_started: needsTraining,
      request_ids: [creation.generationRequestId],
    },
    { status: 201 }
  );
}
