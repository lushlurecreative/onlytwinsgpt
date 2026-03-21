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
  jobIdPrefix: string
): Promise<SwapResult | null> {
  const endpointId = process.env.RUNPOD_ENDPOINT_ID;

  if (!endpointId) {
    console.error("RunPod endpoint not configured");
    return null;
  }

  try {
    // Submit face-swap job to RunPod
    console.log(`[${jobIdPrefix}] Submitting face-swap job to RunPod`);

    const submitResponse = await fetch(
      `https://${endpointId}.api.runpod.ai/run`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          input: {
            type: "faceswap",
            user_photo_url: userPhotoUrl,
            scenario_image_url: scenarioImageUrl,
          },
        }),
      }
    );

    if (!submitResponse.ok) {
      console.error(
        `[${jobIdPrefix}] RunPod submit failed: ${submitResponse.status}`
      );
      return null;
    }

    const result = await submitResponse.json();

    // Handle synchronous response (worker returns completed result immediately)
    if (result.status === "COMPLETED") {
      const swappedUrl = result.output?.swapped_image_url || result.output;
      if (swappedUrl && typeof swappedUrl === "string") {
        console.log(`[${jobIdPrefix}] Face swap completed: ${swappedUrl}`);
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
      return null;
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
        return null;
      }

      if (pollResult.status === "TIMEOUT") {
        console.error(`[${jobIdPrefix}] Job timed out: ${pollResult.error}`);
        return null;
      }
    }

    console.error(
      `[${jobIdPrefix}] Invalid response format: neither completed nor async job`
    );
    return null;
  } catch (error) {
    console.error(
      `[${jobIdPrefix}] Face swap error:`,
      error instanceof Error ? error.message : String(error)
    );
    return null;
  }
}

export async function POST(req: NextRequest) {
  try {
    const { userPhotoUrls, targetImageUrls } = await req.json();

    console.log(
      `[preview_faceswap] Request received: ${userPhotoUrls?.length || 0} user photos, ${targetImageUrls?.length || 0} target images`
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

    // Swap user face into each target image (in parallel)
    const swapPromises = targetImageUrls.map((targetUrl, idx) =>
      callRunPodFaceSwap(
        userPhotoUrl,
        targetUrl,
        `swap_${idx}`
      ).then((result) => {
        if (result) {
          return {
            ...result,
            targetIdx: idx,
          };
        }
        // Fallback to target image if swap failed
        return {
          targetIdx: idx,
          targetUrl: targetUrl,
          swappedUrl: null, // Null = use fallback in UI
          success: false,
          error: "Face swap failed",
        };
      })
    );

    const results = await Promise.all(swapPromises);

    const successCount = results.filter((r) => r.success).length;
    console.log(
      `[preview_faceswap] Complete: ${successCount}/${results.length} successful`
    );

    return NextResponse.json({
      results: results as SwapResult[],
      successCount: successCount,
    });
  } catch (error) {
    console.error(
      "[preview_faceswap] Error:",
      error instanceof Error ? error.message : String(error)
    );
    return NextResponse.json(
      { error: "Face swap preview failed" },
      { status: 500 }
    );
  }
}
