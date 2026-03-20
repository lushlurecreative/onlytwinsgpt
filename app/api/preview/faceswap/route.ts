import { NextRequest, NextResponse } from "next/server";
import { getRunPodConfig, submitRunPodJob } from "@/lib/runpod";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Face swap preview API for homepage.
 * Uses your existing RunPod worker via polling.
 */
async function callRunPodFaceSwap(
  userPhotoUrl: string,
  scenarioImageUrl: string
): Promise<{ swappedImageUrl: string; fallback: boolean }> {
  const config = await getRunPodConfig();
  if (!config) {
    console.warn("RunPod not configured, falling back to original image");
    return { swappedImageUrl: scenarioImageUrl, fallback: true };
  }

  try {
    // Submit faceswap job to RunPod
    const result = await submitRunPodJob(config, {
      type: "faceswap",
      user_photo_url: userPhotoUrl,
      scenario_image_url: scenarioImageUrl,
    });

    if (!result?.id) {
      console.error("Failed to get RunPod job ID");
      return { swappedImageUrl: scenarioImageUrl, fallback: true };
    }

    const jobId = result.id;

    // Poll for completion (max 50 seconds to stay under 60s function limit)
    const maxAttempts = 25;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      await new Promise((resolve) => setTimeout(resolve, 2000));

      // Check job status via RunPod API
      const statusResponse = await fetch(
        `https://api.runpod.ai/v2/${config.endpointId}/status/${jobId}`,
        {
          headers: {
            Authorization: `Bearer ${config.apiKey}`,
          },
        }
      );

      if (!statusResponse.ok) {
        console.error(
          `RunPod status check error: ${statusResponse.status}`,
          await statusResponse.text()
        );
        continue;
      }

      const status = await statusResponse.json();

      // Check for completion
      if (status.status === "COMPLETED") {
        const output = status.output;
        if (output?.swapped_image_url) {
          return {
            swappedImageUrl: output.swapped_image_url,
            fallback: false,
          };
        }
        // If output exists but no image, still return it
        if (output) {
          return {
            swappedImageUrl: output,
            fallback: true,
          };
        }
      }

      // Check for failure
      if (status.status === "FAILED") {
        console.error("RunPod job failed:", status.error || status);
        return { swappedImageUrl: scenarioImageUrl, fallback: true };
      }

      // Still processing, continue polling
    }

    console.error("RunPod polling timed out");
    return { swappedImageUrl: scenarioImageUrl, fallback: true };
  } catch (error) {
    console.error(
      "RunPod face swap error:",
      error instanceof Error ? error.message : String(error)
    );
    return {
      swappedImageUrl: scenarioImageUrl,
      fallback: true,
    };
  }
}

export async function POST(req: NextRequest) {
  try {
    const { userPhotoUrl, scenarioImageUrl } = await req.json();

    if (!userPhotoUrl || !scenarioImageUrl) {
      return NextResponse.json(
        { error: "Missing userPhotoUrl or scenarioImageUrl" },
        { status: 400 }
      );
    }

    const result = await callRunPodFaceSwap(userPhotoUrl, scenarioImageUrl);

    return NextResponse.json(result);
  } catch (error) {
    console.error("Face swap preview error:", error);
    return NextResponse.json(
      { error: "Face swap processing failed" },
      { status: 500 }
    );
  }
}
