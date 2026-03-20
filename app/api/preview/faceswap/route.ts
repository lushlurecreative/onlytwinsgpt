import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Face swap preview API for homepage.
 * Calls RunPod synchronous endpoint directly (Load balancer type).
 */
async function callRunPodFaceSwapSync(
  userPhotoUrl: string,
  scenarioImageUrl: string
): Promise<{ swappedImageUrl: string; fallback: boolean }> {
  const endpointId = process.env.RUNPOD_ENDPOINT_ID;
  const apiKey = process.env.RUNPOD_API_KEY;

  if (!endpointId || !apiKey) {
    console.warn("RunPod endpoint or API key not configured");
    return { swappedImageUrl: scenarioImageUrl, fallback: true };
  }

  try {
    // Direct synchronous call to RunPod Load Balancer endpoint
    const response = await fetch(
      `https://api.runpod.io/v2/${endpointId}/runsync`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
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

    if (!response.ok) {
      const errorText = await response.text();
      console.error(
        `RunPod error: ${response.status}`,
        errorText
      );
      return { swappedImageUrl: scenarioImageUrl, fallback: true };
    }

    const result = await response.json();

    // Check for completion status
    if (result.status === "COMPLETED" && result.output) {
      const swappedUrl = result.output.swapped_image_url;
      return {
        swappedImageUrl: swappedUrl || scenarioImageUrl,
        fallback: !swappedUrl,
      };
    }

    // If status is not completed or no output
    if (result.status === "FAILED") {
      console.error("RunPod job failed:", result.error);
      return { swappedImageUrl: scenarioImageUrl, fallback: true };
    }

    console.error("Unexpected RunPod response:", result);
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

    const result = await callRunPodFaceSwapSync(userPhotoUrl, scenarioImageUrl);

    return NextResponse.json(result);
  } catch (error) {
    console.error("Face swap preview error:", error);
    return NextResponse.json(
      { error: "Face swap processing failed" },
      { status: 500 }
    );
  }
}
