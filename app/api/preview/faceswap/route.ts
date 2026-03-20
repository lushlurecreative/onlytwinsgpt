import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Face swap preview API for homepage.
 * Accepts user photos and scenario image, returns face-swapped preview.
 * Uses Fal.ai for fast processing.
 */
export async function POST(req: NextRequest) {
  try {
    const { userPhotoBase64, scenarioImageUrl } = await req.json();

    if (!userPhotoBase64 || !scenarioImageUrl) {
      return NextResponse.json(
        { error: "Missing userPhotoBase64 or scenarioImageUrl" },
        { status: 400 }
      );
    }

    const falKey = process.env.FAL_KEY;
    if (!falKey) {
      return NextResponse.json(
        { error: "FAL_KEY not configured" },
        { status: 500 }
      );
    }

    // Call Fal.ai face swap API
    // Using their swap-face model which is fast and reliable
    const falResponse = await fetch("https://api.fal.ai/v1/face-swap", {
      method: "POST",
      headers: {
        "Authorization": `Key ${falKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        source_image: {
          url: "data:image/jpeg;base64," + userPhotoBase64,
        },
        target_image: {
          url: scenarioImageUrl,
        },
      }),
    });

    if (!falResponse.ok) {
      const error = await falResponse.text();
      console.error("Fal.ai error:", falResponse.status, error);

      // Fallback: return original scenario if face swap fails
      return NextResponse.json({
        swappedImageUrl: scenarioImageUrl,
        fallback: true,
      });
    }

    const result = await falResponse.json();

    // Fal.ai returns the result in different formats depending on the model
    // Check common response formats
    const swappedUrl =
      result.image?.url ||
      result.images?.[0]?.url ||
      result.output ||
      scenarioImageUrl;

    return NextResponse.json({
      swappedImageUrl: swappedUrl,
      fallback: false,
    });
  } catch (error) {
    console.error("Face swap preview error:", error);

    // Fail gracefully - return empty response so UI can handle it
    return NextResponse.json(
      { error: "Face swap processing failed" },
      { status: 500 }
    );
  }
}
