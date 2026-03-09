import type { SupabaseClient } from "@supabase/supabase-js";
import { createGenerationRequestWithUsage } from "@/lib/generation-request-intake";
import { normalizeMixLines, type MixLine } from "@/lib/request-planner";
import { getCurrentSubscriptionSummary } from "@/lib/request-planner";
import { computeCutoff } from "@/lib/request-planner";

type BatchSource = "manual_save" | "monthly_scheduler" | "api_generation_request" | "vault_generate" | "generate_images";

export type CanonicalIntakeInput = {
  userId: string;
  rawLines: unknown;
  samplePaths: string[];
  source: BatchSource;
  idempotencyKey?: string | null;
  cycleStartIso: string;
  cycleEndIso: string;
};

export type CanonicalIntakeResult =
  | {
      ok: true;
      generationRequestId: string;
      lines: MixLine[];
      autoFilledLines: MixLine[];
      totals: { photos: number; videos: number };
      alreadyExisted?: boolean;
    }
  | { ok: false; status: number; error: string; code?: string };

const DEFAULT_PHOTO_PROMPTS = [
  "Lifestyle social media creator look",
  "Luxury editorial portrait set",
  "Outdoor vacation look",
];
const DEFAULT_VIDEO_PROMPTS = [
  "Short social reel with natural camera movement",
  "Lifestyle motion clip with clean lighting",
];

function inferScenePreset(prompt: string) {
  const text = prompt.toLowerCase();
  if (text.includes("beach")) return "beach";
  if (text.includes("camp") || text.includes("outdoor")) return "camping";
  if (text.includes("coffee")) return "coffee_shop";
  if (text.includes("swim")) return "swimsuit_try_on";
  if (text.includes("street")) return "street_style";
  if (text.includes("night")) return "nightlife";
  if (text.includes("city")) return "city";
  if (text.includes("home") || text.includes("bedroom")) return "casual_home";
  return "gym";
}

function inferContentMode(lines: MixLine[]): "sfw" | "mature" {
  const text = lines.map((line) => line.prompt.toLowerCase()).join(" ");
  if (text.includes("nsfw") || text.includes("adult") || text.includes("explicit")) return "mature";
  return "sfw";
}

function buildAutoFillLine(type: "photo" | "video", qty: number, index: number, fallbackFromUser?: string): MixLine {
  const defaults = type === "photo" ? DEFAULT_PHOTO_PROMPTS : DEFAULT_VIDEO_PROMPTS;
  return {
    id: crypto.randomUUID(),
    type,
    quantity: qty,
    prompt: fallbackFromUser || defaults[index % defaults.length],
  };
}

export function autoFillAllowance(lines: MixLine[], allowance: { photos: number; videos: number }) {
  const userLines = [...lines];
  const currentPhotos = userLines.filter((line) => line.type === "photo").reduce((sum, line) => sum + line.quantity, 0);
  const currentVideos = userLines.filter((line) => line.type === "video").reduce((sum, line) => sum + line.quantity, 0);

  let remainingPhotos = Math.max(0, allowance.photos - currentPhotos);
  let remainingVideos = Math.max(0, allowance.videos - currentVideos);

  const preferredPhotoPrompt = userLines.find((line) => line.type === "photo")?.prompt;
  const preferredVideoPrompt = userLines.find((line) => line.type === "video")?.prompt;

  const autoFilledLines: MixLine[] = [];
  let index = 0;
  while (remainingPhotos > 0) {
    const qty = Math.min(remainingPhotos, 5);
    autoFilledLines.push(buildAutoFillLine("photo", qty, index, preferredPhotoPrompt));
    remainingPhotos -= qty;
    index += 1;
  }
  index = 0;
  while (remainingVideos > 0) {
    const qty = Math.min(remainingVideos, 2);
    autoFilledLines.push(buildAutoFillLine("video", qty, index, preferredVideoPrompt));
    remainingVideos -= qty;
    index += 1;
  }

  const merged = [...userLines, ...autoFilledLines];
  const totals = {
    photos: merged.filter((line) => line.type === "photo").reduce((sum, line) => sum + line.quantity, 0),
    videos: merged.filter((line) => line.type === "video").reduce((sum, line) => sum + line.quantity, 0),
  };
  return { lines: merged, autoFilledLines, totals };
}

export async function createCanonicalCustomerGenerationBatch(
  admin: SupabaseClient,
  input: CanonicalIntakeInput
): Promise<CanonicalIntakeResult> {
  const summary = await getCurrentSubscriptionSummary(admin, input.userId);
  const subscriptionStatus = String(summary.status ?? "").toLowerCase();
  if (!["active", "trialing", "past_due"].includes(subscriptionStatus)) {
    return { ok: false, status: 403, error: "Subscription is not eligible for generation.", code: "SUBSCRIPTION_NOT_ELIGIBLE" };
  }

  const normalized = normalizeMixLines(input.rawLines);
  if (normalized.length === 0) {
    return { ok: false, status: 400, error: "At least one request line is required.", code: "EMPTY_MIX" };
  }

  const overPhoto = normalized.filter((line) => line.type === "photo").reduce((sum, line) => sum + line.quantity, 0) > summary.includedImages;
  const overVideo = normalized.filter((line) => line.type === "video").reduce((sum, line) => sum + line.quantity, 0) > summary.includedVideos;
  if (overPhoto || overVideo) {
    return { ok: false, status: 400, error: "Requested totals exceed plan allowance.", code: "EXCEEDS_ALLOWANCE" };
  }

  const filled = autoFillAllowance(normalized, {
    photos: summary.includedImages,
    videos: summary.includedVideos,
  });
  const scenePreset = inferScenePreset(filled.lines[0]?.prompt ?? "gym");
  const contentMode = inferContentMode(filled.lines);

  const existingIdempotency = input.idempotencyKey?.trim() || null;
  const createResult = await createGenerationRequestWithUsage(admin, {
    userId: input.userId,
    samplePaths: input.samplePaths,
    scenePreset,
    imageCount: filled.totals.photos,
    videoCount: filled.totals.videos,
    contentMode,
    idempotencyKey: existingIdempotency,
  });

  if (!createResult.ok) {
    return {
      ok: false,
      status: createResult.status,
      error: createResult.error,
      code: createResult.code,
    };
  }

  const requestId = String(createResult.request.id);
  await admin
    .from("generation_requests")
    .update({
      source: input.source,
      cycle_start: input.cycleStartIso,
      cycle_end: input.cycleEndIso,
      mix_snapshot_json: filled.lines,
      autofill_snapshot_json: filled.autoFilledLines,
      progress_total: filled.totals.photos + filled.totals.videos,
    })
    .eq("id", requestId);

  const lineRows = filled.lines.map((line, idx) => ({
    generation_request_id: requestId,
    line_index: idx,
    line_type: line.type,
    quantity: line.quantity,
    prompt: line.prompt,
    scene_preset: inferScenePreset(line.prompt),
    source: filled.autoFilledLines.some((auto) => auto.id === line.id) ? "auto_fill" : "user",
    metadata_json: { original_line_id: line.id },
  }));
  if (lineRows.length > 0) {
    await admin.from("generation_request_lines").insert(lineRows);
  }

  return {
    ok: true,
    generationRequestId: requestId,
    lines: filled.lines,
    autoFilledLines: filled.autoFilledLines,
    totals: filled.totals,
  };
}

export async function upsertRecurringMixForTargetCycle(
  admin: SupabaseClient,
  userId: string,
  lines: MixLine[],
  nextRenewalAt: string | null
) {
  const timing = computeCutoff(nextRenewalAt);
  if (!nextRenewalAt) return null;
  const nextCycleStart = new Date(nextRenewalAt);
  const nextCycleEnd = new Date(nextCycleStart.getTime() + 30 * 24 * 60 * 60 * 1000);
  const followingCycleStart = new Date(nextCycleEnd);
  const followingCycleEnd = new Date(followingCycleStart.getTime() + 30 * 24 * 60 * 60 * 1000);
  const appliesStart = timing.appliesTo === "next_cycle" ? nextCycleStart : followingCycleStart;
  const appliesEnd = timing.appliesTo === "next_cycle" ? nextCycleEnd : followingCycleEnd;

  await admin.from("recurring_request_mixes").upsert(
    {
      user_id: userId,
      applies_cycle_start: appliesStart.toISOString(),
      applies_cycle_end: appliesEnd.toISOString(),
      lines_json: lines,
      source: "request_preferences_save",
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,applies_cycle_start" }
  );

  return {
    appliesTo: timing.appliesTo,
    cutoffAt: timing.cutoffAt,
    appliesCycleStart: appliesStart.toISOString(),
    appliesCycleEnd: appliesEnd.toISOString(),
  };
}

