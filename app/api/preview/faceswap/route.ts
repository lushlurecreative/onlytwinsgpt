import { NextRequest, NextResponse } from "next/server";
import { pollRunPodJob } from "@/lib/runpod-helpers";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

export const runtime = "nodejs";
export const maxDuration = 300; // 5 minutes for 3 swaps

/**
 * Face swap preview API for homepage.
 * Calls RunPod GPU worker for 3 parallel face swaps.
 * Handles both synchronous (immediate result) and async (polling) patterns.
 */

/**
 * Convert Supabase public URLs to signed URLs.
 * The uploads bucket is private, so /object/public/ URLs return 400.
 * We extract the storage path and generate a short-lived signed URL instead.
 */
async function toSignedUrlIfSupabase(url: string): Promise<string> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!supabaseUrl) return url;

  const publicPrefix = `${supabaseUrl}/storage/v1/object/public/uploads/`;
  if (!url.startsWith(publicPrefix)) return url;

  const storagePath = url.slice(publicPrefix.length);
  console.log(`[signed_url] Converting public URL to signed URL for path: ${storagePath}`);

  try {
    const admin = getSupabaseAdmin();
    const { data, error } = await admin.storage
      .from("uploads")
      .createSignedUrl(storagePath, 600); // 10 minutes expiry

    if (error || !data?.signedUrl) {
      console.error(`[signed_url] Failed to create signed URL: ${error?.message || "no data"}`);
      return url; // Fall back to original URL
    }

    console.log(`[signed_url] Signed URL created successfully`);
    return data.signedUrl;
  } catch (e) {
    console.error(`[signed_url] Exception: ${e instanceof Error ? e.message : String(e)}`);
    return url;
  }
}

interface SwapResult {
  targetIdx: number;
  targetUrl: string;
  swappedUrl: string | null;
  success: boolean;
  error?: string;
}

async function callRunPodFaceSwap(
  userPhotoUrl: string,
  scenarioImageUrl: string,
  jobIdPrefix: string,
  timeoutMs: number = 30000
): Promise<SwapResult> {
  const endpointId = process.env.RUNPOD_ENDPOINT_ID;
  const apiKey = process.env.RUNPOD_API_KEY;

  if (!endpointId) {
    console.error("RunPod endpoint not configured");
    return {
      targetIdx: -1,
      targetUrl: scenarioImageUrl,
      swappedUrl: null,
      success: false,
      error: "RunPod endpoint not configured",
    };
  }

  if (!apiKey) {
    console.error("RunPod API key not configured");
    return {
      targetIdx: -1,
      targetUrl: scenarioImageUrl,
      swappedUrl: null,
      success: false,
      error: "RunPod API key not configured",
    };
  }

  try {
    const url = `https://api.runpod.ai/v2/${endpointId}/runsync`;
    const startMs = Date.now();
    console.log(
      `[${jobIdPrefix}] Submitting to: ${url} (timeout=${timeoutMs}ms)`
    );

    // Create AbortController with timeout to prevent hanging
    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      const elapsedMs = Date.now() - startMs;
      console.error(
        `[${jobIdPrefix}] AbortController timeout fired after ${elapsedMs}ms`
      );
      controller.abort();
    }, timeoutMs);

    const submitResponse = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        input: {
          type: "faceswap",
          user_photo_url: userPhotoUrl,
          scenario_image_url: scenarioImageUrl,
        },
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);
    const fetchDurationMs = Date.now() - startMs;

    console.log(
      `[${jobIdPrefix}] Response received after ${fetchDurationMs}ms: status=${submitResponse.status}, content-length=${submitResponse.headers.get("content-length") || "unknown"}`
    );

    if (!submitResponse.ok) {
      const responseText = await submitResponse.text();
      console.error(
        `[${jobIdPrefix}] RunPod error status=${submitResponse.status}, body=${responseText.substring(0, 500)}`
      );
      return {
        targetIdx: -1,
        targetUrl: scenarioImageUrl,
        swappedUrl: null,
        success: false,
        error: `RunPod error: ${submitResponse.status}`,
      };
    }

    let result;
    try {
      const parseStartMs = Date.now();
      result = await submitResponse.json();
      const parseDurationMs = Date.now() - parseStartMs;
      console.log(
        `[${jobIdPrefix}] JSON parsed after ${parseDurationMs}ms, status=${result.status}`
      );
    } catch (parseError) {
      const bodyText = await submitResponse.text();
      console.error(
        `[${jobIdPrefix}] JSON parse failed, status=${submitResponse.status}, body=${bodyText.substring(0, 500)}`
      );
      return {
        targetIdx: -1,
        targetUrl: scenarioImageUrl,
        swappedUrl: null,
        success: false,
        error: "JSON parse failed",
      };
    }

    // Handle synchronous response (worker returns base64 image data)
    if (result.status === "COMPLETED") {
      const imageBase64 = result.output?.image_base64;
      if (imageBase64 && typeof imageBase64 === "string") {
        const totalMs = Date.now() - startMs;
        console.log(
          `[${jobIdPrefix}] Face swap completed in ${totalMs}ms, uploading ${imageBase64.length} chars base64`
        );

        // Upload to Supabase via admin client (worker can't auth to Supabase)
        try {
          const admin = getSupabaseAdmin();
          const buffer = Buffer.from(imageBase64, "base64");
          const storagePath = `preview-faceswaps/${crypto.randomUUID()}.jpg`;

          const { error: uploadError } = await admin.storage
            .from("uploads")
            .upload(storagePath, buffer, {
              contentType: "image/jpeg",
              upsert: true,
            });

          if (uploadError) {
            console.error(`[${jobIdPrefix}] Supabase upload failed: ${uploadError.message}`);
            return {
              targetIdx: -1,
              targetUrl: scenarioImageUrl,
              swappedUrl: null,
              success: false,
              error: `Upload failed: ${uploadError.message}`,
            };
          }

          // Generate signed URL for the result (bucket is private)
          const { data: signedData, error: signError } = await admin.storage
            .from("uploads")
            .createSignedUrl(storagePath, 3600); // 1 hour expiry

          const swappedUrl = signedData?.signedUrl ||
            `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/uploads/${storagePath}`;

          if (signError) {
            console.warn(`[${jobIdPrefix}] Signed URL failed, using public URL: ${signError.message}`);
          }

          console.log(`[${jobIdPrefix}] Upload + signed URL complete: ${swappedUrl.substring(0, 80)}...`);
          return {
            targetIdx: -1,
            targetUrl: scenarioImageUrl,
            swappedUrl: swappedUrl,
            success: true,
          };
        } catch (uploadErr) {
          console.error(`[${jobIdPrefix}] Upload exception: ${uploadErr instanceof Error ? uploadErr.message : String(uploadErr)}`);
          return {
            targetIdx: -1,
            targetUrl: scenarioImageUrl,
            swappedUrl: null,
            success: false,
            error: "Upload failed",
          };
        }
      }
    }

    // Handle failed response
    if (result.status === "FAILED") {
      console.error(
        `[${jobIdPrefix}] Face swap failed: ${result.error || "unknown error"}`
      );
      return {
        targetIdx: -1,
        targetUrl: scenarioImageUrl,
        swappedUrl: null,
        success: false,
        error: result.error || "Face swap failed",
      };
    }

    // Handle async response with job ID (for future async worker implementations)
    const jobId = result.id;
    if (jobId) {
      console.log(`[${jobIdPrefix}] Job submitted: ${jobId}`);
      const pollResult = await pollRunPodJob(endpointId, jobId, 120000);

      if (pollResult.status === "COMPLETED") {
        const swappedUrl =
          pollResult.output?.swapped_image_url || pollResult.output;
        if (swappedUrl && typeof swappedUrl === "string") {
          console.log(`[${jobIdPrefix}] Job completed: ${swappedUrl}`);
          return {
            targetIdx: -1,
            targetUrl: scenarioImageUrl,
            swappedUrl: swappedUrl,
            success: true,
          };
        }
      }

      if (pollResult.status === "FAILED") {
        console.error(
          `[${jobIdPrefix}] Job failed: ${pollResult.error || "unknown error"}`
        );
        return {
          targetIdx: -1,
          targetUrl: scenarioImageUrl,
          swappedUrl: null,
          success: false,
          error: pollResult.error || "Job failed",
        };
      }

      if (pollResult.status === "TIMEOUT") {
        console.error(`[${jobIdPrefix}] Job timed out: ${pollResult.error}`);
        return {
          targetIdx: -1,
          targetUrl: scenarioImageUrl,
          swappedUrl: null,
          success: false,
          error: "Job timeout",
        };
      }
    }

    console.error(
      `[${jobIdPrefix}] Invalid response format: neither completed nor async job, got: ${JSON.stringify(result).substring(0, 200)}`
    );
    return {
      targetIdx: -1,
      targetUrl: scenarioImageUrl,
      swappedUrl: null,
      success: false,
      error: "Invalid response format",
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    const isTimeout = errorMsg.includes("timeout") || errorMsg.includes("TIMEOUT") || errorMsg.includes("abort");
    console.error(
      `[${jobIdPrefix}] Fetch error (timeout=${isTimeout}): ${errorMsg}`
    );
    return {
      targetIdx: -1,
      targetUrl: scenarioImageUrl,
      swappedUrl: null,
      success: false,
      error: isTimeout ? "Request timeout" : `Error: ${errorMsg}`,
    };
  }
}

export async function POST(req: NextRequest) {
  const requestId = Math.random().toString(36).substring(2, 9);

  try {
    const { userPhotoUrls, targetImageUrls } = await req.json();

    console.log(
      `[preview_faceswap:${requestId}] Request received: ${userPhotoUrls?.length || 0} photos, ${targetImageUrls?.length || 0} targets`
    );

    if (
      !userPhotoUrls ||
      !Array.isArray(userPhotoUrls) ||
      !targetImageUrls ||
      !Array.isArray(targetImageUrls)
    ) {
      return NextResponse.json(
        { error: "Missing or invalid userPhotoUrls or targetImageUrls" },
        { status: 400 }
      );
    }

    if (userPhotoUrls.length === 0 || targetImageUrls.length === 0) {
      return NextResponse.json(
        {
          error: "At least 1 user photo and 1 target image required",
        },
        { status: 400 }
      );
    }

    // Convert relative URLs to absolute so the external worker can fetch them
    const origin =
      process.env.NEXT_PUBLIC_APP_URL ||
      `${req.nextUrl.protocol}//${req.nextUrl.host}`;
    const toAbsolute = (url: string) =>
      url.startsWith("/") ? `${origin}${url}` : url;

    const absoluteUserUrls = userPhotoUrls.map(toAbsolute);
    const absoluteTargetUrls = targetImageUrls.map(toAbsolute);

    console.log(
      `[preview_faceswap:${requestId}] URLs resolved with origin=${origin}`
    );

    // Convert Supabase private-bucket URLs to signed URLs so the worker can download them
    const signedUserUrls = await Promise.all(
      absoluteUserUrls.map(toSignedUrlIfSupabase)
    );

    // Use first user photo for all swaps
    const userPhotoUrl = signedUserUrls[0];

    // TEMPORARY: Run only 1 swap to diagnose timeout vs broken worker
    // TODO: Restore parallel 3-swap flow once worker is confirmed working
    const diagnosticTarget = absoluteTargetUrls[0];
    console.log(
      `[preview_faceswap:${requestId}] DIAGNOSTIC MODE: 1 swap only (of ${targetImageUrls.length} targets)`
    );

    const singleResult = await callRunPodFaceSwap(
      userPhotoUrl,
      diagnosticTarget,
      `preview_faceswap:${requestId}:swap_0`,
      90000 // 90s timeout for diagnostic — gives worker time to cold-start
    );

    const results: SwapResult[] = [
      { ...singleResult, targetIdx: 0 },
      // Fill remaining slots as skipped so UI still renders 3 cards
      ...targetImageUrls.slice(1).map((url, idx) => ({
        targetIdx: idx + 1,
        targetUrl: url,
        swappedUrl: null as string | null,
        success: false,
        error: "Skipped (diagnostic mode)",
      })),
    ];

    const successCount = results.filter((r) => r.success).length;
    console.log(
      `[preview_faceswap:${requestId}] Complete: ${successCount}/${results.length} successful`
    );

    return NextResponse.json({
      results: results as SwapResult[],
      successCount: successCount,
    });
  } catch (error) {
    console.error(
      `[preview_faceswap:${requestId}] Error:`,
      error instanceof Error ? error.message : String(error)
    );
    return NextResponse.json(
      { error: "Face swap preview failed" },
      { status: 500 }
    );
  }
}
