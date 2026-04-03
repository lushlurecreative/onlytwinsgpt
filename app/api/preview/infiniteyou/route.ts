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
export const maxDuration = 300; // 5 min — 3 sequential generations (~100s total)

/**
 * InfiniteYou preview: generate 3 identity-preserving AI images from one face photo.
 * Called from the homepage to give visitors a "wow" preview of their AI twin.
 *
 * POST { userPhotoUrl: string }
 * Returns { results: SwapResult[], successCount: number }
 */

const PREVIEW_SCENES = [
  {
    prompt:
      "professional portrait photo at a tropical beach, golden hour lighting, " +
      "ocean in background, natural skin texture, 85mm lens, shallow depth of field, photorealistic",
  },
  {
    prompt:
      "stylish portrait in a modern city at night, neon lights reflecting, " +
      "urban fashion, cinematic lighting, professional photography, photorealistic",
  },
  {
    prompt:
      "fitness portrait at a luxury gym, athletic wear, dramatic lighting, " +
      "confident expression, professional sports photography, photorealistic",
  },
];

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

    // 4. Generate each scene sequentially
    const admin = getSupabaseAdmin();
    const results: SwapResult[] = [];

    for (let i = 0; i < PREVIEW_SCENES.length; i++) {
      const scene = PREVIEW_SCENES[i];
      const tag = `[infiniteyou:${requestId}:scene_${i}]`;
      const startMs = Date.now();

      try {
        console.log(`${tag} Queueing...`);
        const prompt = buildInfiniteYouPrompt(imageName, scene.prompt);
        const promptId = await queuePrompt(serverUrl, prompt);
        console.log(`${tag} Queued: ${promptId}`);

        const history = await waitForCompletion(serverUrl, promptId, 120_000);
        const elapsed = ((Date.now() - startMs) / 1000).toFixed(1);
        console.log(`${tag} Generated in ${elapsed}s`);

        const outputBuffer = await downloadOutput(serverUrl, history);
        console.log(`${tag} Downloaded: ${(outputBuffer.length / 1024).toFixed(0)} KB`);

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

        console.log(`${tag} Complete — ${swappedUrl.slice(0, 60)}...`);

        results.push({
          targetIdx: i,
          targetUrl: scene.prompt.slice(0, 60),
          swappedUrl,
          success: true,
        });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error(`${tag} Failed: ${msg}`);
        results.push({
          targetIdx: i,
          targetUrl: scene.prompt.slice(0, 60),
          swappedUrl: null,
          success: false,
          error: msg,
        });
      }
    }

    const successCount = results.filter((r) => r.success).length;
    console.log(
      `[infiniteyou:${requestId}] Done: ${successCount}/${results.length} successful`
    );

    return NextResponse.json({ results, successCount });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error(`[infiniteyou:${requestId}] Fatal: ${msg}`);
    return NextResponse.json(
      { error: "AI preview generation failed" },
      { status: 500 }
    );
  }
}
