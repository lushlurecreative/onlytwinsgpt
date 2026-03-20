import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Face swap preview API for homepage.
 * Uses Together.ai's face-swap API via their inference endpoint.
 */
async function callTogetherAi(
  userPhotoUrl: string,
  scenarioImageUrl: string,
  togetherApiKey: string | undefined
): Promise<{ swappedImageUrl: string; fallback: boolean }> {
  if (!togetherApiKey) {
    console.warn("No Together.ai API key, falling back to original image");
    return { swappedImageUrl: scenarioImageUrl, fallback: true };
  }

  try {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${togetherApiKey}`,
    };

    // Together.ai face swap endpoint
    const response = await fetch(
      "https://api.together.xyz/v1/images/faceswap",
      {
        method: "POST",
        headers,
        body: JSON.stringify({
          image_url: scenarioImageUrl,
          face_image_url: userPhotoUrl,
        }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Together.ai error: ${response.status}`, errorText);

      // If that endpoint doesn't exist, try their inference API
      return await tryTogetherInference(
        userPhotoUrl,
        scenarioImageUrl,
        togetherApiKey
      );
    }

    const result = await response.json();
    const swappedUrl = result?.result?.image || result?.image || scenarioImageUrl;

    return {
      swappedImageUrl: swappedUrl,
      fallback: !result?.result?.image,
    };
  } catch (error) {
    console.error(
      "Together.ai face swap error:",
      error instanceof Error ? error.message : String(error)
    );
    return {
      swappedImageUrl: scenarioImageUrl,
      fallback: true,
    };
  }
}

async function tryTogetherInference(
  userPhotoUrl: string,
  scenarioImageUrl: string,
  togetherApiKey: string
): Promise<{ swappedImageUrl: string; fallback: boolean }> {
  try {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${togetherApiKey}`,
    };

    // Try Together.ai inference endpoint with a face-swap model
    const response = await fetch("https://api.together.xyz/inference", {
      method: "POST",
      headers,
      body: JSON.stringify({
        model: "deepinsight/inswapper",
        prompt: `Face swap: swap the face from ${userPhotoUrl} into ${scenarioImageUrl}`,
        image_url: scenarioImageUrl,
        face_image_url: userPhotoUrl,
        negative_prompt: "blurry, low quality",
        steps: 20,
        temperature: 0.7,
        top_p: 0.9,
      }),
    });

    if (!response.ok) {
      console.error(
        `Together.ai inference error: ${response.status}`,
        await response.text()
      );
      return { swappedImageUrl: scenarioImageUrl, fallback: true };
    }

    const result = await response.json();
    const swappedUrl =
      result?.output?.[0] || result?.data?.[0] || scenarioImageUrl;

    return {
      swappedImageUrl: swappedUrl,
      fallback: !swappedUrl || swappedUrl === scenarioImageUrl,
    };
  } catch (error) {
    console.error(
      "Together.ai inference error:",
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

    const togetherApiKey = process.env.TOGETHER_API_KEY;
    const result = await callTogetherAi(
      userPhotoUrl,
      scenarioImageUrl,
      togetherApiKey
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
