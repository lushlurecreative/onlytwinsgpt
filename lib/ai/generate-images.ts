/**
 * Image generation is handled by the RunPod worker (FLUX + LoRA + IP-Adapter + ControlNet + Real-ESRGAN).
 * Do not call OpenAI for image generation. Use generation_jobs: create job, poll until done, use output_path.
 */

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

/**
 * @deprecated Use generation_jobs: createGenerationJob + pollAllGenerationJobsUntilDone.
 * This stub throws. All routes have been updated to use the job pipeline.
 */
export async function generateImages(_input: GenerateImagesInput): Promise<GenerateImagesOutput> {
  throw new Error(
    "Image generation uses the RunPod worker pipeline (FLUX + LoRA + IP-Adapter + ControlNet + Real-ESRGAN). Use createGenerationJob and poll from @/lib/generation-jobs."
  );
}
