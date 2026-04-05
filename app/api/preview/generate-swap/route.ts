import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { pollRunPodJob } from "@/lib/runpod-helpers";
import {
  checkComfyUIHealth,
  buildFluxScenePrompt,
  queuePrompt,
  waitForCompletion,
  downloadOutput,
} from "@/lib/comfyui";

export const runtime = "nodejs";
export const maxDuration = 300; // FLUX scene (~30s) + face swap (~60s) + margin

/**
 * 2-Step Preview Pipeline:
 *   Step 1: FLUX generates scene via ComfyUI (generic person, no identity)
 *   Step 2: HyperSwap face swap via RunPod (exact identity from user photos)
 *
 * POST { userPhotoUrls: string[], gender?: string }
 * Returns { results: SwapResult[], successCount: number }
 */

const SCENE_PROMPTS = {
  neutral:
    "professional medium shot photograph of a person standing at a tropical beach, " +
    "upper body visible, golden hour warm lighting, ocean in background, " +
    "natural skin texture, 50mm lens, shallow depth of field, " +
    "photorealistic, editorial photography, real photograph",
  male:
    "professional medium shot photograph of a young man standing at a tropical beach, " +
    "upper body visible, golden hour warm lighting, ocean in background, " +
    "natural skin texture, 50mm lens, shallow depth of field, " +
    "photorealistic, editorial photography, real photograph",
  female:
    "professional medium shot photograph of a young woman standing at a tropical beach, " +
    "upper body visible, golden hour warm lighting, ocean in background, " +
    "natural skin texture, 50mm lens, shallow depth of field, " +
    "photorealistic, editorial photography, real photograph",
};

interface SwapResult {
  targetIdx: number;
  targetUrl: string;
  swappedUrl: string | null;
  success: boolean;
  error?: string;
}

function fail(error: string): NextResponse {
  return NextResponse.json({
    results: [
      { targetIdx: 0, targetUrl: "", swappedUrl: null, success: false, error },
    ] as SwapResult[],
    successCount: 0,
  });
}

async function toSignedUrl(storagePath: string): Promise<string> {
  const admin = getSupabaseAdmin();
  const { data, error } = await admin.storage
    .from("uploads")
    .createSignedUrl(storagePath, 600);
  if (error || !data?.signedUrl) {
    return `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/uploads/${storagePath}`;
  }
  return data.signedUrl;
}

async function resolveUserPhotoUrl(url: string): Promise<string> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!supabaseUrl) return url;
  const publicPrefix = `${supabaseUrl}/storage/v1/object/public/uploads/`;
  if (!url.startsWith(publicPrefix)) return url;
  const storagePath = url.slice(publicPrefix.length);
  return toSignedUrl(storagePath);
}

export async function POST(req: NextRequest) {
  const rid = Math.random().toString(36).substring(2, 9);
  const comfyUrl = process.env.COMFYUI_SERVER_URL?.replace(/\/$/, "");
  const endpointId = process.env.RUNPOD_ENDPOINT_ID;
  const apiKey = process.env.RUNPOD_API_KEY;

  if (!comfyUrl) {
    console.error(`[gen_swap:${rid}] COMFYUI_SERVER_URL not set`);
    return NextResponse.json({ error: "AI generation not configured" }, { status: 503 });
  }
  if (!endpointId || !apiKey) {
    console.error(`[gen_swap:${rid}] RunPod not configured`);
    return NextResponse.json({ error: "AI generation not configured" }, { status: 503 });
  }

  try {
    const body = await req.json();
    let userPhotoUrls: string[] = body.userPhotoUrls || [];
    if (!userPhotoUrls.length && body.userPhotoUrl) {
      userPhotoUrls = [body.userPhotoUrl];
    }
    const gender: string = body.gender || "neutral";

    if (!userPhotoUrls.length) {
      return NextResponse.json({ error: "Missing userPhotoUrls" }, { status: 400 });
    }

    console.log(`[gen_swap:${rid}] Start — ${userPhotoUrls.length} photo(s), gender=${gender}`);
    const t0 = Date.now();

    // ── STEP 1: FLUX scene generation via ComfyUI ────────────────────
    console.log(`[gen_swap:${rid}] Step 1: FLUX scene generation...`);

    const health = await checkComfyUIHealth(comfyUrl);
    if (!health.ok) {
      console.error(`[gen_swap:${rid}] ComfyUI unreachable: ${health.error}`);
      return NextResponse.json({ error: "AI generation temporarily unavailable" }, { status: 503 });
    }

    const scenePrompt = SCENE_PROMPTS[gender as keyof typeof SCENE_PROMPTS] || SCENE_PROMPTS.neutral;
    const prompt = buildFluxScenePrompt(scenePrompt, { steps: 20 });
    const promptId = await queuePrompt(comfyUrl, prompt);
    console.log(`[gen_swap:${rid}] Queued: ${promptId}`);

    const history = await waitForCompletion(comfyUrl, promptId, 90_000);
    const sceneBuffer = await downloadOutput(comfyUrl, history);
    const step1Ms = Date.now() - t0;
    console.log(`[gen_swap:${rid}] Step 1 done (${(step1Ms / 1000).toFixed(1)}s): ${(sceneBuffer.length / 1024).toFixed(0)} KB`);

    // Upload scene to Supabase so RunPod worker can fetch it
    const admin = getSupabaseAdmin();
    const sceneStoragePath = `preview-scenes/${crypto.randomUUID()}.png`;
    const { error: sceneUploadError } = await admin.storage
      .from("uploads")
      .upload(sceneStoragePath, sceneBuffer, { contentType: "image/png", upsert: true });

    if (sceneUploadError) {
      console.error(`[gen_swap:${rid}] Scene upload failed: ${sceneUploadError.message}`);
      return fail("Scene upload failed");
    }

    const sceneSignedUrl = await toSignedUrl(sceneStoragePath);
    const faceSignedUrls = await Promise.all(
      userPhotoUrls.map((url) => resolveUserPhotoUrl(url))
    );

    // ── STEP 2: Face swap via RunPod (HyperSwap + post-processing) ──
    console.log(`[gen_swap:${rid}] Step 2: Face swap via RunPod (${faceSignedUrls.length} source photos)...`);
    const t2 = Date.now();

    const runpodUrl = `https://api.runpod.ai/v2/${endpointId}/runsync`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 180_000);

    const swapResponse = await fetch(runpodUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        input: {
          type: "faceswap",
          user_photo_urls: faceSignedUrls,
          scenario_image_url: sceneSignedUrl,
        },
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!swapResponse.ok) {
      const text = await swapResponse.text();
      console.error(`[gen_swap:${rid}] RunPod error: ${swapResponse.status} ${text.slice(0, 200)}`);
      return fail(`Face swap error: ${swapResponse.status}`);
    }

    let swapResult: Record<string, unknown>;
    try {
      swapResult = (await swapResponse.json()) as Record<string, unknown>;
    } catch {
      return fail("Face swap response parse failed");
    }

    let imageBase64: string | null = null;

    if (swapResult.status === "COMPLETED") {
      const output = swapResult.output as Record<string, unknown> | undefined;
      imageBase64 = (output?.image_base64 as string) || null;
    } else if (swapResult.status === "FAILED") {
      console.error(`[gen_swap:${rid}] Face swap failed: ${swapResult.error}`);
      return fail((swapResult.error as string) || "Face swap failed");
    } else if (swapResult.id && (swapResult.status === "IN_QUEUE" || swapResult.status === "IN_PROGRESS")) {
      console.log(`[gen_swap:${rid}] Job ${swapResult.id} queued, polling...`);
      const pollResult = await pollRunPodJob(endpointId, swapResult.id as string, 180_000);
      if (pollResult.status === "COMPLETED") {
        imageBase64 = pollResult.output?.image_base64 || null;
      } else {
        console.error(`[gen_swap:${rid}] Poll: ${pollResult.status} — ${pollResult.error}`);
        return fail(pollResult.error || "Face swap timed out");
      }
    }

    if (!imageBase64) {
      return fail("No output from face swap");
    }

    const step2Ms = Date.now() - t2;
    console.log(`[gen_swap:${rid}] Step 2 done (${(step2Ms / 1000).toFixed(1)}s)`);

    // Upload final result to Supabase
    const resultBuffer = Buffer.from(imageBase64, "base64");
    const resultStoragePath = `preview-generate-swap/${crypto.randomUUID()}.jpg`;

    const { error: resultUploadError } = await admin.storage
      .from("uploads")
      .upload(resultStoragePath, resultBuffer, { contentType: "image/jpeg", upsert: true });

    if (resultUploadError) {
      console.error(`[gen_swap:${rid}] Result upload failed: ${resultUploadError.message}`);
      return fail("Result upload failed");
    }

    const { data: resultSignedData } = await admin.storage
      .from("uploads")
      .createSignedUrl(resultStoragePath, 3600);

    const swappedUrl =
      resultSignedData?.signedUrl ||
      `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/uploads/${resultStoragePath}`;

    const totalMs = Date.now() - t0;
    console.log(`[gen_swap:${rid}] Done — ${(totalMs / 1000).toFixed(1)}s total (scene: ${(step1Ms / 1000).toFixed(1)}s, swap: ${(step2Ms / 1000).toFixed(1)}s)`);

    // Clean up intermediate scene image
    admin.storage.from("uploads").remove([sceneStoragePath]).catch(() => {});

    return NextResponse.json({
      results: [{ targetIdx: 0, targetUrl: "", swappedUrl, success: true }] as SwapResult[],
      successCount: 1,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    const isAbort = msg.includes("abort") || msg.includes("AbortError");
    console.error(`[gen_swap:${rid}] Fatal${isAbort ? " (timeout)" : ""}: ${msg}`);
    return NextResponse.json(
      { error: "AI preview generation failed" },
      { status: 500 },
    );
  }
}
