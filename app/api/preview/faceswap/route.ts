import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Face swap preview API for homepage.
 * Accepts user photos and scenario image, returns face-swapped preview.
 * Uses Fal.ai's async face-swap API with polling to avoid timeout issues.
 */
async function callFalaiAsync(
  userPhotoUrl: string,
  scenarioImageUrl: string,
  falApiKey: string | undefined
): Promise<{ swappedImageUrl: string; fallback: boolean }> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (falApiKey) {
    headers["Authorization"] = `Key ${falApiKey}`;
  }

  try {
    // Step 1: Submit async request
    const submitResponse = await fetch(
      "https://api.fal.ai/queue/submit/fal-ai/face-swap",
      {
        method: "POST",
        headers,
        body: JSON.stringify({
          swap_image_url: userPhotoUrl,
          base_image_url: scenarioImageUrl,
        }),
      }
    );

    if (!submitResponse.ok) {
      const errorText = await submitResponse.text();
      console.error(
        `Fal.ai submit error: ${submitResponse.status}`,
        errorText
      );
      return {
        swappedImageUrl: scenarioImageUrl,
        fallback: true,
      };
    }

    const submitData = await submitResponse.json();
    const requestId = submitData.request_id;

    if (!requestId) {
      console.error("No request_id in Fal.ai response:", submitData);
      return {
        swappedImageUrl: scenarioImageUrl,
        fallback: true,
      };
    }

    // Step 2: Poll for result (max 50 seconds to stay under 60s timeout)
    const maxAttempts = 25;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      await new Promise((resolve) => setTimeout(resolve, 2000)); // Wait 2s between polls

      const statusResponse = await fetch(
        `https://api.fal.ai/queue/status/${requestId}`,
        {
          method: "GET",
          headers,
        }
      );

      if (!statusResponse.ok) {
        console.error(
          `Fal.ai status check error: ${statusResponse.status}`,
          await statusResponse.text()
        );
        continue;
      }

      const statusData = await statusResponse.json();

      if (statusData.status === "completed") {
        const swappedUrl =
          statusData.result?.image?.url || scenarioImageUrl;
        return {
          swappedImageUrl: swappedUrl,
          fallback: swappedUrl === scenarioImageUrl,
        };
      }

      if (statusData.status === "failed") {
        console.error(
          "Fal.ai processing failed:",
          statusData.error
        );
        return {
          swappedImageUrl: scenarioImageUrl,
          fallback: true,
        };
      }

      // Still processing, continue polling
    }

    // Polling timed out
    console.error("Fal.ai polling timed out after 50 seconds");
    return {
      swappedImageUrl: scenarioImageUrl,
      fallback: true,
    };
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

    const falApiKey = process.env.FAL_API_KEY;
    const result = await callFalaiAsync(
      userPhotoUrl,
      scenarioImageUrl,
      falApiKey
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
