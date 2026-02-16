import { generateImagesWithOpenAI } from "@/lib/image-generation";

export type ContentMode = "sfw" | "mature";

export type GenerateImagesInput = {
  sourceFile: Blob;
  sourceExt: string;
  scenePreset: string;
  count: number;
  contentMode: ContentMode;
};

export type GenerateImagesOutput = {
  images: Uint8Array[];
  caption: string;
  provider: string;
};

function getProviderKey() {
  return (process.env.AI_IMAGE_PROVIDER ?? "openai").toLowerCase().trim();
}

export async function generateImages(input: GenerateImagesInput): Promise<GenerateImagesOutput> {
  const provider = getProviderKey();

  // The current production path. Other providers can be added behind this switch without
  // changing API routes or database schemas.
  if (provider === "openai") {
    const out = await generateImagesWithOpenAI(input);
    return { ...out, provider: "openai" };
  }

  // Provider scaffolds (intentionally explicit errors until configured).
  if (provider === "replicate") {
    throw new Error(
      "AI_IMAGE_PROVIDER=replicate is not configured yet. Set AI_IMAGE_PROVIDER=openai or implement Replicate FLUX integration."
    );
  }
  if (provider === "fal") {
    throw new Error(
      "AI_IMAGE_PROVIDER=fal is not configured yet. Set AI_IMAGE_PROVIDER=openai or implement Fal PuLID integration."
    );
  }

  throw new Error(`Unknown AI_IMAGE_PROVIDER: ${provider}`);
}

