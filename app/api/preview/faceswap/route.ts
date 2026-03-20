import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Face swap preview API for homepage.
 * Accepts user photos and scenario image, returns face-swapped preview.
 * Uses Fal.ai's FastSwap for real face swapping.
 */
export async function POST(req: NextRequest) {
  try {
    const { userPhotoUrl, scenarioImageUrl } = await req.json();

    if (!userPhotoUrl || !scenarioImageUrl) {
      return NextResponse.json(
        { error: "Missing userPhotoUrl or scenarioImageUrl" },
        { status: 400 }
      );
    }

    // Use Fal.ai for face swapping
    // Free tier available, no API key required (optional for higher limits)
    const falApiKey = process.env.FAL_API_KEY;

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (falApiKey) {
      headers["Authorization"] = `Key ${falApiKey}`;
    }

    // Call Fal.ai face swap endpoint (fal-ai/face-swap)
    // Uses the standard face swap model, free tier available
    const falResponse = await fetch(
      "https://fal.run/fal-ai/face-swap",
      {
        method: "POST",
        headers,
        body: JSON.stringify({
          swap_image_url: userPhotoUrl,
          base_image_url: scenarioImageUrl,
        }),
      }
    );

    if (!falResponse.ok) {
      const errorText = await falResponse.text();
      console.error("Fal.ai error:", falResponse.status, errorText);
      return NextResponse.json({
        swappedImageUrl: scenarioImageUrl,
        fallback: true,
      });
    }

    const result = await falResponse.json();

    // Fal.ai returns result directly with output.image containing the swapped image URL
    const swappedUrl =
      result?.output?.image?.url ||
      result?.image?.url ||
      scenarioImageUrl;

    return NextResponse.json({
      swappedImageUrl: swappedUrl,
      fallback: swappedUrl === scenarioImageUrl,
    });
  } catch (error) {
    console.error("Face swap preview error:", error);
    return NextResponse.json(
      { error: "Face swap processing failed" },
      { status: 500 }
    );
  }
}
