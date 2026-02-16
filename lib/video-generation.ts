/**
 * Video generation via Replicate.
 * Uses image-to-video models; requires REPLICATE_API_TOKEN.
 */

export type GenerateVideoInput = {
  /** First-frame image as URL or base64 data URI */
  imageUrl: string;
  /** Motion prompt for the video */
  prompt: string;
};

export type GenerateVideoOutput = {
  /** URL to the generated video file */
  videoUrl: string;
  /** Provider used */
  provider: string;
};

export async function generateVideo(input: GenerateVideoInput): Promise<GenerateVideoOutput> {
  const token = process.env.REPLICATE_API_TOKEN?.trim();
  if (!token) {
    throw new Error("REPLICATE_API_TOKEN is not set. Add it in Vercel Environment Variables to enable video generation.");
  }

  const Replicate = (await import("replicate")).default;
  const replicate = new Replicate({ auth: token });

  // VideoCrafter image-to-video: https://replicate.com/cjwbw/videocrafter
  // Input: task, image (URL or data URI), prompt (string)
  const output = await replicate.run("cjwbw/videocrafter", {
    input: {
      task: "image2video",
      image: input.imageUrl,
      prompt: input.prompt,
    },
  });

  const videoUrl = typeof output === "string" ? output : (output as string[])?.[0];
  if (!videoUrl || typeof videoUrl !== "string") {
    throw new Error("Video generation returned no URL");
  }

  return { videoUrl, provider: "replicate" };
}
