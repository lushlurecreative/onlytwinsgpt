import sharp from "sharp";
import { getScenePresetByKey } from "@/lib/scene-presets";

type GenerateOptions = {
  sourceFile: Blob;
  sourceExt: string;
  scenePreset: string;
  count: number;
  contentMode: "sfw" | "mature";
};

function buildCaption(scenePreset: string, contentMode: "sfw" | "mature") {
  const preset = getScenePresetByKey(scenePreset);
  const sceneLabel = preset?.label ?? "Scene";
  return `OnlyTwins ${sceneLabel} set (${contentMode.toUpperCase()})`;
}

function buildPrompt(scenePreset: string, contentMode: "sfw" | "mature") {
  const scene = getScenePresetByKey(scenePreset);
  const scenePrompt = scene?.prompt ?? "A realistic lifestyle scene";
  const modePrompt =
    contentMode === "mature"
      ? "Keep it tasteful and non-explicit. Implied/suggestive is allowed. No explicit nudity, no sexual acts, no pornographic framing."
      : "Keep it fully safe-for-work: no nudity, no explicit sexual content, no pornographic framing.";
  return [
    "Create a photorealistic transformation based on the provided reference person.",
    "Preserve identity consistency and realistic anatomy.",
    scenePrompt,
    modePrompt,
    "Avoid cartoon style and AI artifacts.",
    "Output social-ready quality with natural skin texture.",
  ].join(" ");
}

async function scrubAndInjectMetadata(inputBytes: Uint8Array) {
  const now = new Date();
  const dateStamp = now.toISOString().replace("T", " ").slice(0, 19);
  type WithExifArg = Parameters<ReturnType<typeof sharp>["withExif"]>[0];
  const exif = {
    IFD0: {
      Make: "Apple",
      Model: "iPhone 15 Pro",
      Software: "OnlyTwins Pipeline",
    },
    // `sharp` typing doesn't currently include ExifIFD, but the runtime supports it.
    ExifIFD: {
      DateTimeOriginal: dateStamp,
      DateTimeDigitized: dateStamp,
      LensMake: "Apple",
    },
  } as unknown as WithExifArg;
  return await sharp(inputBytes)
    .jpeg({ quality: 94, mozjpeg: true })
    .withExif(exif)
    .toBuffer();
}

export async function generateImagesWithOpenAI({
  sourceFile,
  sourceExt,
  scenePreset,
  count,
  contentMode,
}: GenerateOptions) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not set");
  }
  const model = process.env.OPENAI_IMAGE_MODEL ?? "gpt-image-1";

  const formData = new FormData();
  formData.append("model", model);
  formData.append("prompt", buildPrompt(scenePreset, contentMode));
  formData.append("n", String(count));
  formData.append("size", "1024x1536");
  formData.append("image", sourceFile, `source.${sourceExt}`);

  const aiResponse = await fetch("https://api.openai.com/v1/images/edits", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: formData,
  });
  const aiJson = (await aiResponse.json().catch(() => ({}))) as {
    data?: Array<{ b64_json?: string }>;
    error?: { message?: string };
  };
  if (!aiResponse.ok || !aiJson.data?.length) {
    throw new Error(aiJson.error?.message ?? "Image generation failed");
  }

  const processed = await Promise.all(
    aiJson.data
      .filter((item) => !!item.b64_json)
      .map(async (item) => {
        const raw = Uint8Array.from(Buffer.from(item.b64_json ?? "", "base64"));
        const bytes = await scrubAndInjectMetadata(raw);
        return bytes;
      })
  );

  return {
    images: processed,
    caption: buildCaption(scenePreset, contentMode),
  };
}

