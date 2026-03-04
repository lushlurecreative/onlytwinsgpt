import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveUsageContext, isGenerationEligibleSubscriptionStatus } from "@/lib/usage-limits";

type ContentMode = "sfw" | "mature";

export type CreateGenerationRequestInput = {
  userId: string;
  samplePaths: string[];
  scenePreset: string;
  imageCount: number;
  videoCount: number;
  contentMode: ContentMode;
  idempotencyKey?: string | null;
};

export type CreateGenerationRequestResult =
  | { ok: true; request: { id: string } & Record<string, unknown> }
  | { ok: false; status: number; error: string; code?: string; subscriptionStatus?: string | null };

export async function createGenerationRequestWithUsage(
  admin: SupabaseClient,
  input: CreateGenerationRequestInput
): Promise<CreateGenerationRequestResult> {
  const usageContext = await resolveUsageContext(admin, input.userId);
  if (!usageContext) {
    return {
      ok: false,
      status: 403,
      error: "No active subscription usage context found.",
      code: "NO_USAGE_CONTEXT",
    };
  }

  if (!isGenerationEligibleSubscriptionStatus(usageContext.subscriptionStatus)) {
    return {
      ok: false,
      status: 403,
      error: "Subscription does not allow new generation requests.",
      code: "SUBSCRIPTION_NOT_ELIGIBLE",
      subscriptionStatus: usageContext.subscriptionStatus,
    };
  }

  const { data, error } = await admin.rpc("create_generation_request_with_usage", {
    p_user_id: input.userId,
    p_sample_paths: input.samplePaths,
    p_scene_preset: input.scenePreset,
    p_image_count: input.imageCount,
    p_video_count: input.videoCount,
    p_content_mode: input.contentMode,
    p_period_start: usageContext.periodStartIso,
    p_period_end: usageContext.periodEndIso,
    p_limit_images: usageContext.imageLimit,
    p_limit_videos: usageContext.videoLimit,
    p_idempotency_key: input.idempotencyKey?.trim() || null,
  });

  if (error || !data) {
    const message = error?.message ?? "Failed to create request";
    if (message.includes("USAGE_LIMIT_EXCEEDED_IMAGES")) {
      return {
        ok: false,
        status: 402,
        error: "Image usage limit exceeded for current billing period.",
        code: "USAGE_LIMIT_EXCEEDED_IMAGES",
      };
    }
    if (message.includes("USAGE_LIMIT_EXCEEDED_VIDEOS")) {
      return {
        ok: false,
        status: 402,
        error: "Video usage limit exceeded for current billing period.",
        code: "USAGE_LIMIT_EXCEEDED_VIDEOS",
      };
    }
    return { ok: false, status: 400, error: message };
  }

  const inserted = Array.isArray(data) ? data[0] : data;
  if (!inserted?.id) {
    return { ok: false, status: 400, error: "Failed to create request" };
  }

  return { ok: true, request: inserted as { id: string } & Record<string, unknown> };
}
