import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { getScenePresetByKey } from "@/lib/scene-presets";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { createCanonicalCustomerGenerationBatch } from "@/lib/customer-generation";
import { getCurrentSubscriptionSummary } from "@/lib/request-planner";
import { processPendingCustomerGeneration } from "@/lib/customer-generation-processor";

type GenerateBody = {
  sourcePath?: string;
  scenePreset?: string;
  count?: number;
  visibility?: "public" | "subscribers";
  contentMode?: "sfw" | "mature";
};

export async function POST(request: Request) {
  const supabase = await createClient();
  const admin = getSupabaseAdmin();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: GenerateBody = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const sourcePath = body.sourcePath?.trim();
  if (!sourcePath || !sourcePath.startsWith(`${user.id}/`)) {
    return NextResponse.json({ error: "Valid sourcePath owned by current user is required" }, { status: 400 });
  }

  const scene = getScenePresetByKey(body.scenePreset ?? "");
  if (!scene) {
    return NextResponse.json({ error: "Invalid scenePreset" }, { status: 400 });
  }

  const count = Math.max(1, Math.min(10, Number(body.count ?? 1)));
  const visibility = body.visibility === "subscribers" ? "subscribers" : "public";
  const { data: uploadList } = await admin.storage.from("uploads").list(`${user.id}/training`, {
    limit: 100,
    offset: 0,
    sortBy: { column: "created_at", order: "desc" },
  });
  const samplePaths = (uploadList ?? [])
    .map((obj) => `${user.id}/training/${obj.name}`)
    .filter((path) => /\.(jpg|jpeg|png|webp|gif)$/i.test(path));
  if (!samplePaths.includes(sourcePath)) {
    samplePaths.unshift(sourcePath);
  }
  const normalizedSamples = Array.from(new Set(samplePaths)).slice(0, 20);
  if (normalizedSamples.length < 10) {
    return NextResponse.json({ error: "Upload at least 10 training photos before generating." }, { status: 400 });
  }
  const summary = await getCurrentSubscriptionSummary(admin, user.id);
  const cycleEndIso = summary.nextRenewalAt ?? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
  const cycleStartIso = new Date(new Date(cycleEndIso).getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const create = await createCanonicalCustomerGenerationBatch(admin, {
    userId: user.id,
    rawLines: [
      {
        id: crypto.randomUUID(),
        kind: "photo",
        count,
        direction: `${scene.label} ${visibility} scene`,
      },
    ],
    samplePaths: normalizedSamples,
    source: "generate_images",
    idempotencyKey: `generate-images:${user.id}:${cycleStartIso.slice(0, 10)}:${scene.key}`,
    cycleStartIso,
    cycleEndIso,
  });
  if (!create.ok) {
    return NextResponse.json({ error: create.error, code: create.code }, { status: create.status });
  }
  await processPendingCustomerGeneration(admin, 5);
  return NextResponse.json({ requestId: create.generationRequestId, queued: true }, { status: 201 });
}
