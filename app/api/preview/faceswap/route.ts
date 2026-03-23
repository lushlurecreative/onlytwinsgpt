import { NextRequest, NextResponse } from "next/server";
import { pollRunPodJob } from "@/lib/runpod-helpers";

export const runtime = "nodejs";
export const maxDuration = 300; // 5 minutes for 3 swaps

/**
 * Face swap preview API for homepage.
 * Calls RunPod GPU worker for 3 parallel face swaps.
 * Handles both synchronous (immediate result) and async (polling) patterns.
 */

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
    const url = `https://${endpointId}.api.runpod.ai/run`;
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

    // Handle synchronous response (worker returns completed result immediately)
    if (result.status === "COMPLETED") {
      const swappedUrl = result.output?.swapped_image_url || result.output;
      if (swappedUrl && typeof swappedUrl === "string") {
        const totalMs = Date.now() - startMs;
        console.log(
          `[${jobIdPrefix}] Face swap completed in ${totalMs}ms: ${swappedUrl}`
        );
        return {
          targetIdx: -1, // Set by caller
          targetUrl: scenarioImageUrl,
          swappedUrl: swappedUrl,
          success: true,
        };
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

    // Use first user photo for all swaps
    const userPhotoUrl = userPhotoUrls[0];

    // TEMPORARY: Run only 1 swap to diagnose timeout vs broken worker
    // TODO: Restore parallel 3-swap flow once worker is confirmed working
    const diagnosticTarget = targetImageUrls[0];
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
