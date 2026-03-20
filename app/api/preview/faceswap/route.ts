import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Face swap preview API for homepage.
 * Uses Replicate's API with polling for reliable processing.
 */
async function callReplicateAsync(
  userPhotoUrl: string,
  scenarioImageUrl: string,
  replicateApiKey: string | undefined
): Promise<{ swappedImageUrl: string; fallback: boolean }> {
  if (!replicateApiKey) {
    console.warn("No Replicate API key, falling back to original image");
    return { swappedImageUrl: scenarioImageUrl, fallback: true };
  }

  try {
    // Submit prediction to Replicate
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Authorization: `Token ${replicateApiKey}`,
    };

    const submitResponse = await fetch(
      "https://api.replicate.com/v1/predictions",
      {
        method: "POST",
        headers,
        body: JSON.stringify({
          version:
            "47ba0acd8d21b6a19e86b15839ae74d488f73252234c92d3025420e98e895858",
          input: {
            image: scenarioImageUrl,
            swap_image: userPhotoUrl,
          },
        }),
      }
    );

    if (!submitResponse.ok) {
      const errorText = await submitResponse.text();
      console.error(
        `Replicate submit error: ${submitResponse.status}`,
        errorText
      );
      return { swappedImageUrl: scenarioImageUrl, fallback: true };
    }

    const prediction = await submitResponse.json();
    const predictionId = prediction.id;

    if (!predictionId) {
      console.error("No prediction ID from Replicate:", prediction);
      return { swappedImageUrl: scenarioImageUrl, fallback: true };
    }

    // Poll for completion (max 50 seconds)
    const maxAttempts = 25;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      await new Promise((resolve) => setTimeout(resolve, 2000));

      const statusResponse = await fetch(
        `https://api.replicate.com/v1/predictions/${predictionId}`,
        {
          method: "GET",
          headers,
        }
      );

      if (!statusResponse.ok) {
        console.error(
          `Replicate status check error: ${statusResponse.status}`,
          await statusResponse.text()
        );
        continue;
      }

      const status = await statusResponse.json();

      if (status.status === "succeeded") {
        const outputUrl = status.output;
        return {
          swappedImageUrl: outputUrl || scenarioImageUrl,
          fallback: !outputUrl,
        };
      }

      if (status.status === "failed") {
        console.error("Replicate prediction failed:", status.error);
        return { swappedImageUrl: scenarioImageUrl, fallback: true };
      }

      // Still processing, continue polling
    }

    console.error("Replicate polling timed out");
    return { swappedImageUrl: scenarioImageUrl, fallback: true };
  } catch (error) {
    console.error(
      "Face swap error:",
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

    const replicateApiKey = process.env.REPLICATE_API_TOKEN;
    const result = await callReplicateAsync(
      userPhotoUrl,
      scenarioImageUrl,
      replicateApiKey
    );

    return NextResponse.json(result);
  } catch (error) {
    console.error("Face swap preview error:", error);
    return NextResponse.json(
      { error: "Face swap processing failed" },
      { status: 500 }
    );
  }
}
