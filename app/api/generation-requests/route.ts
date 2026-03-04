import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { getScenePresetByKey } from "@/lib/scene-presets";
import { sendAlert } from "@/lib/observability";
import { isUserSuspended } from "@/lib/suspend";
import { createGenerationRequestWithUsage } from "@/lib/generation-request-intake";

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
  const creation = await createGenerationRequestWithUsage(admin, {
    userId: user.id,
    samplePaths,
    scenePreset: scene.key,
    imageCount,
    videoCount,
    contentMode,
    idempotencyKey,
  });
  if (!creation.ok) {
    return NextResponse.json(
      {
        error: creation.error,
        code: creation.code,
        subscription_status: creation.subscriptionStatus,
      },
      { status: creation.status }
    );
  }
  const inserted = creation.request;
  if (!inserted?.id) {
    return NextResponse.json({ error: "Failed to create request" }, { status: 400 });
  }

  await sendAlert("generation_request_submitted", {
    request_id: inserted.id,
    user_id: user.id,
    scene: scene.key,
    content_mode: contentMode,
    image_count: imageCount,
    video_count: videoCount,
  });

  return NextResponse.json({ request: inserted }, { status: 201 });
}

