import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import {
  uploadImageToComfyUI,
  buildInfiniteYouPrompt,
  queuePrompt,
  waitForCompletion,
  downloadOutput,
  checkComfyUIHealth,
} from "@/lib/comfyui";

export const runtime = "nodejs";
export const maxDuration = 60; // single image, 12 steps ≈ 15s

/**
 * InfiniteYou preview: generate 1 identity-preserving AI image from a face photo.
 * Homepage hook — must be fast (~15s). Uses 12 inference steps for speed.
 *
 * POST { userPhotoUrl: string }
 * Returns { results: SwapResult[], successCount: number }
 */

const PREVIEW_PROMPT =
  "raw candid photo of a person at a tropical beach, golden hour, natural sunlight, " +
  "ocean waves in background, real skin texture with pores, 85mm f/1.4 lens, " +
  "film grain, unretouched, editorial photography";

const PREVIEW_STEPS = 20; // balance of quality and speed (~24s)

interface SwapResult {
  targetIdx: number;
  targetUrl: string;
  swappedUrl: string | null;
  success: boolean;
  error?: string;
}

async function toSignedUrlIfSupabase(url: string): Promise<string> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!supabaseUrl) return url;

  const publicPrefix = `${supabaseUrl}/storage/v1/object/public/uploads/`;
  if (!url.startsWith(publicPrefix)) return url;

  const storagePath = url.slice(publicPrefix.length);
  try {
    const admin = getSupabaseAdmin();
    const { data, error } = await admin.storage
      .from("uploads")
      .createSignedUrl(storagePath, 600);
    if (error || !data?.signedUrl) return url;
    return data.signedUrl;
  } catch {
    return url;
  }
}

export async function POST(req: NextRequest) {
  const requestId = Math.random().toString(36).substring(2, 9);
  const serverUrl = process.env.COMFYUI_SERVER_URL?.replace(/\/$/, "");

  if (!serverUrl) {
    console.error(`[infiniteyou:${requestId}] COMFYUI_SERVER_URL not set`);
    return NextResponse.json(
      { error: "AI generation not configured" },
      { status: 503 }
    );
  }

  try {
    const body = await req.json();
    const userPhotoUrl: string =
      body.userPhotoUrl || (body.userPhotoUrls && body.userPhotoUrls[0]);

    if (!userPhotoUrl || typeof userPhotoUrl !== "string") {
      return NextResponse.json(
        { error: "Missing userPhotoUrl" },
        { status: 400 }
      );
    }

    console.log(`[infiniteyou:${requestId}] Starting — photo: ${userPhotoUrl.slice(0, 80)}...`);

    // 1. Check ComfyUI is alive
    const health = await checkComfyUIHealth(serverUrl);
    if (!health.ok) {
      console.error(`[infiniteyou:${requestId}] ComfyUI unreachable: ${health.error}`);
      return NextResponse.json(
        { error: "AI generation temporarily unavailable" },
        { status: 503 }
      );
    }
    console.log(`[infiniteyou:${requestId}] ComfyUI OK — ${health.vramGb} GB VRAM`);

    // 2. Download the user's photo
    const signedUrl = await toSignedUrlIfSupabase(userPhotoUrl);
    const photoRes = await fetch(signedUrl);
    if (!photoRes.ok) {
      console.error(`[infiniteyou:${requestId}] Photo download failed: ${photoRes.status}`);
      return NextResponse.json(
        { error: "Could not access uploaded photo" },
        { status: 400 }
      );
    }
    const imageBuffer = Buffer.from(await photoRes.arrayBuffer());
    console.log(`[infiniteyou:${requestId}] Photo downloaded: ${(imageBuffer.length / 1024).toFixed(0)} KB`);

    // 3. Upload to ComfyUI (once — reused across all 3 generations)
    const imageName = await uploadImageToComfyUI(serverUrl, imageBuffer);
    console.log(`[infiniteyou:${requestId}] Uploaded to ComfyUI as: ${imageName}`);

    // 4. Generate one image (12 steps for speed)
    const admin = getSupabaseAdmin();
    const startMs = Date.now();

    try {
      console.log(`[infiniteyou:${requestId}] Queueing (${PREVIEW_STEPS} steps)...`);
      const prompt = buildInfiniteYouPrompt(imageName, PREVIEW_PROMPT, {
        steps: PREVIEW_STEPS,
      });
      const promptId = await queuePrompt(serverUrl, prompt);
      console.log(`[infiniteyou:${requestId}] Queued: ${promptId}`);

      const history = await waitForCompletion(serverUrl, promptId, 60_000);
      const elapsed = ((Date.now() - startMs) / 1000).toFixed(1);
      console.log(`[infiniteyou:${requestId}] Generated in ${elapsed}s`);

      const outputBuffer = await downloadOutput(serverUrl, history);
      console.log(
        `[infiniteyou:${requestId}] Downloaded: ${(outputBuffer.length / 1024).toFixed(0)} KB`
      );

      // Upload result to Supabase
      const storagePath = `preview-infiniteyou/${crypto.randomUUID()}.png`;
      const { error: uploadError } = await admin.storage
        .from("uploads")
        .upload(storagePath, outputBuffer, {
          contentType: "image/png",
          upsert: true,
        });

      if (uploadError) {
        throw new Error(`Supabase upload: ${uploadError.message}`);
      }

      const { data: signedData } = await admin.storage
        .from("uploads")
        .createSignedUrl(storagePath, 3600);

      const swappedUrl =
        signedData?.signedUrl ||
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/uploads/${storagePath}`;

      console.log(
        `[infiniteyou:${requestId}] Done in ${elapsed}s — ${swappedUrl.slice(0, 60)}...`
      );

      return NextResponse.json({
        results: [
          { targetIdx: 0, targetUrl: "", swappedUrl, success: true },
        ] as SwapResult[],
        successCount: 1,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`[infiniteyou:${requestId}] Generation failed: ${msg}`);
      return NextResponse.json({
        results: [
          { targetIdx: 0, targetUrl: "", swappedUrl: null, success: false, error: msg },
        ] as SwapResult[],
        successCount: 0,
      });
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error(`[infiniteyou:${requestId}] Fatal: ${msg}`);
    return NextResponse.json(
      { error: "AI preview generation failed" },
      { status: 500 }
    );
  }
}
