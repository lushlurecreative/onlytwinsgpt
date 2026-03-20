import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Face swap preview API for homepage.
 * Accepts user photos and scenario image, returns face-swapped preview.
 * Uses Replicate's face swap model for real face swapping.
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

    const replicateToken = process.env.REPLICATE_API_TOKEN;
    if (!replicateToken) {
      return NextResponse.json(
        { error: "REPLICATE_API_TOKEN not configured" },
        { status: 500 }
      );
    }

    // Use Replicate's face swap model
    // Model: cataclysm/face-swap (https://replicate.com/cataclysm/face-swap)
    const replicateResponse = await fetch(
      "https://api.replicate.com/v1/predictions",
      {
        method: "POST",
        headers: {
          Authorization: `Token ${replicateToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          version:
            "38e2ec5a7ecdde9e5ee90f8b40370e09d9ebc4a1b44fa03b4fa07c6e6e8bfbdc",
          input: {
            swap_image: userPhotoUrl,
            image: scenarioImageUrl,
          },
        }),
      }
    );

    if (!replicateResponse.ok) {
      const error = await replicateResponse.text();
      console.error("Replicate error:", replicateResponse.status, error);
      console.error("Replicate token configured:", !!replicateToken);
      return NextResponse.json({
        swappedImageUrl: scenarioImageUrl,
        fallback: true,
        error: `Replicate API error: ${replicateResponse.status}`,
      });
    }

    const prediction = await replicateResponse.json();

    // Poll for completion
    let completed = false;
    let swappedUrl = scenarioImageUrl;
    let attempts = 0;
    const maxAttempts = 30; // 30 seconds max wait

    while (!completed && attempts < maxAttempts) {
      if (prediction.status === "succeeded") {
        swappedUrl = prediction.output?.[0] || scenarioImageUrl;
        completed = true;
        break;
      } else if (prediction.status === "failed") {
        console.error("Face swap failed:", prediction.error);
        return NextResponse.json({
          swappedImageUrl: scenarioImageUrl,
          fallback: true,
        });
      }

      // Wait 1 second before polling again
      await new Promise((resolve) => setTimeout(resolve, 1000));
      attempts++;

      // Poll for status
      const pollResponse = await fetch(
        `https://api.replicate.com/v1/predictions/${prediction.id}`,
        {
          headers: {
            Authorization: `Token ${replicateToken}`,
          },
        }
      );

      if (pollResponse.ok) {
        const updatedPrediction = await pollResponse.json();
        Object.assign(prediction, updatedPrediction);
      }
    }

    return NextResponse.json({
      swappedImageUrl: swappedUrl,
      fallback: !completed,
    });
  } catch (error) {
    console.error("Face swap preview error:", error);
    return NextResponse.json(
      { error: "Face swap processing failed" },
      { status: 500 }
    );
  }
}
