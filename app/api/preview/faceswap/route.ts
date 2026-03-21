import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Face swap preview API for homepage.
 * Calls RunPod ashleykza/runpod-worker-inswapper endpoint (Load balancer type).
 * Uses async job submission + polling for results.
 */
async function callRunPodFaceSwapAsync(
  userPhotoUrl: string,
  scenarioImageUrl: string
): Promise<{ swappedImageUrl: string; fallback: boolean }> {
  const endpointId = process.env.RUNPOD_ENDPOINT_ID;

  if (!endpointId) {
    console.warn("RunPod endpoint not configured");
    return { swappedImageUrl: scenarioImageUrl, fallback: true };
  }

  try {
    // Step 1: Submit async job
    const submitResponse = await fetch(
      `https://${endpointId}.api.runpod.ai/run`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          input: {
            target_image: scenarioImageUrl,
            swap_image: userPhotoUrl,
          },
        }),
      }
    );

    if (!submitResponse.ok) {
      console.error(`RunPod submit error: ${submitResponse.status}`);
      return { swappedImageUrl: scenarioImageUrl, fallback: true };
    }

    const submitResult = await submitResponse.json();
    const jobId = submitResult.id;

    if (!jobId) {
      console.error("No job ID returned from RunPod");
      return { swappedImageUrl: scenarioImageUrl, fallback: true };
    }

    console.log("Face swap job submitted:", jobId);

    // Step 2: Poll for results (up to 60 seconds)
    const maxAttempts = 30;
    let attempts = 0;

    while (attempts < maxAttempts) {
      await new Promise((resolve) => setTimeout(resolve, 2000)); // Wait 2s between polls

      const statusResponse = await fetch(
        `https://${endpointId}.api.runpod.ai/status/${jobId}`,
        {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
          },
        }
      );

      if (statusResponse.ok) {
        const statusResult = await statusResponse.json();

        if (statusResult.status === "COMPLETED") {
          const swappedUrl = statusResult.output?.image_url || statusResult.output?.output;
          if (swappedUrl) {
            console.log("Face swap successful:", swappedUrl.substring(0, 50));
            return {
              swappedImageUrl: swappedUrl,
              fallback: false,
            };
          }
        }

        if (statusResult.status === "FAILED") {
          console.error("RunPod job failed:", statusResult.error);
          return { swappedImageUrl: scenarioImageUrl, fallback: true };
        }
      }

      attempts++;
    }

    console.error("Face swap timed out after 60 seconds");
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

    const result = await callRunPodFaceSwapAsync(userPhotoUrl, scenarioImageUrl);

    return NextResponse.json(result);
  } catch (error) {
    console.error("Face swap preview error:", error);
    return NextResponse.json(
      { error: "Face swap processing failed" },
      { status: 500 }
    );
  }
}
