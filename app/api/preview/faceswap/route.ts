import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Face swap preview API for homepage.
 * Accepts user photos and scenario image, returns face-swapped preview.
 * Uses Fal.ai's face-swap model with retry logic for reliability.
 */
async function callFalaiWithRetry(
  userPhotoUrl: string,
  scenarioImageUrl: string,
  falApiKey: string | undefined,
  maxRetries = 2
): Promise<{ swappedImageUrl: string; fallback: boolean }> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (falApiKey) {
    headers["Authorization"] = `Key ${falApiKey}`;
  }

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 45000); // 45 second timeout

      const falResponse = await fetch(
        "https://fal.run/fal-ai/face-swap",
        {
          method: "POST",
          headers,
          body: JSON.stringify({
            swap_image_url: userPhotoUrl,
            base_image_url: scenarioImageUrl,
          }),
          signal: controller.signal,
        }
      );

      clearTimeout(timeoutId);

      if (!falResponse.ok) {
        const errorText = await falResponse.text();
        console.error(
          `Fal.ai error (attempt ${attempt + 1}):`,
          falResponse.status,
          errorText
        );

        // Retry on 504, don't retry on other errors
        if (falResponse.status !== 504 || attempt === maxRetries) {
          return {
            swappedImageUrl: scenarioImageUrl,
            fallback: true,
          };
        }
        // Wait before retry
        await new Promise((resolve) =>
          setTimeout(resolve, 1000 * (attempt + 1))
        );
        continue;
      }

      const result = await falResponse.json();
      const swappedUrl =
        result?.output?.image?.url ||
        result?.image?.url ||
        scenarioImageUrl;

      return {
        swappedImageUrl: swappedUrl,
        fallback: swappedUrl === scenarioImageUrl,
      };
    } catch (error) {
      console.error(
        `Face swap attempt ${attempt + 1} error:`,
        error instanceof Error ? error.message : String(error)
      );

      if (attempt === maxRetries) {
        return {
          swappedImageUrl: scenarioImageUrl,
          fallback: true,
        };
      }

      // Wait before retry
      await new Promise((resolve) =>
        setTimeout(resolve, 1000 * (attempt + 1))
      );
    }
  }

  return {
    swappedImageUrl: scenarioImageUrl,
    fallback: true,
  };
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
    const result = await callFalaiWithRetry(
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
