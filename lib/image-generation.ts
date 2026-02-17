/**
 * @deprecated Image generation uses the RunPod worker pipeline (FLUX + LoRA + IP-Adapter + ControlNet + Real-ESRGAN).
 * Use createGenerationJob and poll from @/lib/generation-jobs. Do not call OpenAI for image generation.
 */

type GenerateOptions = {
  sourceFile: Blob;
  sourceExt: string;
  scenePreset: string;
  count: number;
  contentMode: "sfw" | "mature";
};

/**
 * @deprecated Use generation_jobs pipeline. This stub throws.
 */
export async function generateImagesWithOpenAI(_opts: GenerateOptions): Promise<{
  images: Uint8Array[];
  caption: string;
}> {
  throw new Error(
    "Image generation uses the RunPod worker pipeline. Use createGenerationJob and poll from @/lib/generation-jobs."
  );
}

