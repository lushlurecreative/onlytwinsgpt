import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { getScenePresetByKey } from "@/lib/scene-presets";
import { sendAlert } from "@/lib/observability";
import { isUserSuspended } from "@/lib/suspend";
import { createCanonicalCustomerGenerationBatch } from "@/lib/customer-generation";
import { getCurrentSubscriptionSummary } from "@/lib/request-planner";
import { processPendingCustomerGeneration } from "@/lib/customer-generation-processor";

type CreateBody = {
  samplePaths?: string[];
  scenePreset?: string;
  imageCount?: number;
  videoCount?: number;
  contentMode?: "sfw" | "mature";
};

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("generation_requests")
    .select(
      "id, sample_paths, scene_preset, image_count, video_count, status, admin_notes, progress_done, progress_total, retry_count, created_at, updated_at"
    )
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(25);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  return NextResponse.json({ requests: data ?? [] }, { status: 200 });
}

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

  let body: CreateBody = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const idempotencyKey = request.headers.get("idempotency-key")?.trim() || null;

  const samplePaths = (body.samplePaths ?? []).map((p) => p.trim()).filter(Boolean);
  if (samplePaths.length < 10 || samplePaths.length > 20) {
    return NextResponse.json({ error: "Between 10 and 20 sample paths are required" }, { status: 400 });
  }
  const ownsAll = samplePaths.every((p) => p.startsWith(`${user.id}/`));
  if (!ownsAll) {
    return NextResponse.json({ error: "All sample paths must belong to current user" }, { status: 403 });
  }

  const scene = getScenePresetByKey(body.scenePreset ?? "");
  if (!scene) {
    return NextResponse.json({ error: "Invalid scenePreset" }, { status: 400 });
  }

  const imageCount = Math.max(1, Math.min(250, Number(body.imageCount ?? 10)));
  const videoCount = Math.max(0, Math.min(20, Number(body.videoCount ?? 0)));
  const contentMode = body.contentMode === "mature" ? "mature" : "sfw";
  const summary = await getCurrentSubscriptionSummary(admin, user.id);
  const cycleEndIso = summary.nextRenewalAt ?? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
  const cycleStartIso = new Date(new Date(cycleEndIso).getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const lines = [
    {
      id: crypto.randomUUID(),
      kind: "photo",
      count: imageCount,
      direction: `${scene.label} ${contentMode === "mature" ? "mature" : "sfw"} set`,
    },
    ...(videoCount > 0
      ? [
          {
            id: crypto.randomUUID(),
            kind: "video",
            count: videoCount,
            direction: `${scene.label} motion video set`,
          },
        ]
      : []),
  ];
  const creation = await createCanonicalCustomerGenerationBatch(admin, {
    userId: user.id,
    rawLines: lines,
    samplePaths,
    source: "api_generation_request",
    idempotencyKey,
    cycleStartIso,
    cycleEndIso,
  });
  if (!creation.ok) {
    return NextResponse.json(
      {
        error: creation.error,
        code: creation.code,
      },
      { status: creation.status }
    );
  }
  const insertedId = creation.generationRequestId;

  await sendAlert("generation_request_submitted", {
    request_id: insertedId,
    user_id: user.id,
    scene: scene.key,
    content_mode: contentMode,
    image_count: imageCount,
    video_count: videoCount,
  });
  await processPendingCustomerGeneration(admin, 5);

  return NextResponse.json({ request: { id: insertedId } }, { status: 201 });
}

