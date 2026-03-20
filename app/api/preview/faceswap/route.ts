import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Face swap preview API for homepage.
 * Accepts user photos and scenario image, returns face-swapped preview.
 * Uses Hugging Face's InSwapper model for real face swapping.
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

    // Use Hugging Face Inference API for face swapping
    // Model: deepinsight/inswapper (open-source face swap model)
    const hfApiKey = process.env.HUGGING_FACE_API_KEY;

    // Build authorization header if API key exists
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (hfApiKey) {
      headers["Authorization"] = `Bearer ${hfApiKey}`;
    }

    // Hugging Face Inference API expects image data or URLs
    // For inswapper, we need to pass two images: source (user) and target (scenario)
    try {
      const hfResponse = await fetch(
        "https://router.huggingface.co/models/deepinsight/inswapper",
        {
          method: "POST",
          headers,
          body: JSON.stringify({
            inputs: {
              source_image: userPhotoUrl,
              target_image: scenarioImageUrl,
            },
          }),
        }
      );

      if (!hfResponse.ok) {
        const errorText = await hfResponse.text();
        console.error(
          "Hugging Face error:",
          hfResponse.status,
          errorText
        );
        console.error("Request was:", {
          source_image: userPhotoUrl,
          target_image: scenarioImageUrl,
        });
        // Return fallback on error
        return NextResponse.json({
          swappedImageUrl: scenarioImageUrl,
          fallback: true,
        });
      }

      // Try to get the result as blob (image)
      const contentType = hfResponse.headers.get("content-type");
      if (contentType?.includes("image")) {
        const imageBuffer = await hfResponse.arrayBuffer();
        const base64 = Buffer.from(imageBuffer).toString("base64");
        const swappedImageUrl = `data:image/jpeg;base64,${base64}`;

        return NextResponse.json({
          swappedImageUrl,
          fallback: false,
        });
      } else {
        // If response is JSON, it might be an error or status message
        const result = await hfResponse.json();
        console.log("HF response:", result);
        return NextResponse.json({
          swappedImageUrl: scenarioImageUrl,
          fallback: true,
        });
      }
    } catch (fetchError) {
      console.error("Hugging Face fetch error:", fetchError);
      return NextResponse.json({
        swappedImageUrl: scenarioImageUrl,
        fallback: true,
      });
    }
  } catch (error) {
    console.error("Face swap preview error:", error);
    // Return fallback on error
    return NextResponse.json(
      { error: "Face swap processing failed" },
      { status: 500 }
    );
  }
}
