import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 300; // 5 minutes for 3 swaps

/**
 * Face swap preview API for homepage.
 * Calls RunPod GPU worker (Phase 2) for 3 parallel face swaps.
 * Uses async job submission + polling pattern.
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
    // Submit job to RunPod (async pattern)
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

    const submitResult = await submitResponse.json();
    const jobId = submitResult.id;

    if (!jobId) {
      console.error(`[${jobIdPrefix}] No job ID returned from RunPod`);
      return null;
    }

    console.log(`[${jobIdPrefix}] Job submitted: ${jobId}`);

    // Poll for results (up to 120 seconds per job)
    const maxAttempts = 60;
    let attempts = 0;

    while (attempts < maxAttempts) {
      await new Promise((resolve) => setTimeout(resolve, 2000)); // Poll every 2s

      const statusResponse = await fetch(
        `https://${endpointId}.api.runpod.ai/status/${jobId}`,
        {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
          },
        }
      );

      if (!statusResponse.ok) {
        attempts++;
        continue;
      }

      const statusResult = await statusResponse.json();
      const status = statusResult.status;

      if (status === "COMPLETED") {
        const swappedUrl =
          statusResult.output?.swapped_image_url || statusResult.output;
        if (swappedUrl && typeof swappedUrl === "string") {
          console.log(`[${jobIdPrefix}] Job completed: ${swappedUrl}`);
          return {
            targetIdx: -1, // Set by caller
            targetUrl: scenarioImageUrl,
            swappedUrl: swappedUrl,
            success: true,
          };
        }
      }

      if (status === "FAILED") {
        console.error(
          `[${jobIdPrefix}] Job failed: ${statusResult.error || "unknown error"}`
        );
        return null;
      }

      attempts++;
    }

    console.error(`[${jobIdPrefix}] Job timed out after 120s`);
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
