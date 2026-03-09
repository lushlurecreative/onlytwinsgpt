import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { getStripe } from "@/lib/stripe";
import {
  computeCutoff,
  getCurrentSubscriptionSummary,
  normalizeMixLines,
} from "@/lib/request-planner";

const SETTINGS_PREFIX = "request_mix:";
export const runtime = "nodejs";

async function getUserId() {
  const session = await createClient();
  const {
    data: { user },
    error,
  } = await session.auth.getUser();
  if (error || !user) return null;
  return user.id;
}

export async function GET() {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = getSupabaseAdmin();
  const summary = await getCurrentSubscriptionSummary(admin, userId);

  let cycleStartIso: string | null = null;
  let cycleEndIso = summary.nextRenewalAt;
  if (summary.stripeSubscriptionId) {
    try {
      const stripe = getStripe();
      const subscription = await stripe.subscriptions.retrieve(summary.stripeSubscriptionId);
      const subscriptionItem = subscription.items.data[0];
      if (subscriptionItem?.current_period_start && subscriptionItem?.current_period_end) {
        cycleStartIso = new Date(subscriptionItem.current_period_start * 1000).toISOString();
        cycleEndIso = new Date(subscriptionItem.current_period_end * 1000).toISOString();
      }
    } catch {
      cycleStartIso = null;
    }
  }
  if (!cycleStartIso && cycleEndIso) {
    const end = new Date(cycleEndIso);
    cycleStartIso = new Date(end.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
  }

  let usedPhotos = 0;
  let usedVideos = 0;
  if (cycleStartIso && cycleEndIso) {
    const { data: requests } = await admin
      .from("generation_requests")
      .select("image_count, video_count, created_at")
      .eq("user_id", userId)
      .gte("created_at", cycleStartIso)
      .lt("created_at", cycleEndIso);
    for (const row of (requests ?? []) as Array<{ image_count?: number | null; video_count?: number | null }>) {
      usedPhotos += Math.max(0, Number(row.image_count ?? 0));
      usedVideos += Math.max(0, Number(row.video_count ?? 0));
    }
  }

  const key = `${SETTINGS_PREFIX}${userId}`;
  const { data: settingsRow } = await admin.from("app_settings").select("value").eq("key", key).maybeSingle();
  let recurringMix: {
    updatedAt: string | null;
    appliesTo: "next_cycle" | "following_cycle";
    cutoffAt: string | null;
    nextRenewalAt: string | null;
    cycleEffectiveAt: string | null;
    lines: ReturnType<typeof normalizeMixLines>;
  } = {
    updatedAt: null,
    appliesTo: computeCutoff(cycleEndIso).appliesTo,
    cutoffAt: computeCutoff(cycleEndIso).cutoffAt,
    nextRenewalAt: cycleEndIso,
    cycleEffectiveAt: cycleEndIso,
    lines: [],
  };
  if (settingsRow?.value) {
    try {
      const parsed = JSON.parse(settingsRow.value) as {
        updatedAt?: string;
        appliesTo?: "next_cycle" | "following_cycle";
        cutoffAt?: string | null;
        nextRenewalAt?: string | null;
        cycleEffectiveAt?: string | null;
        lines?: unknown[];
      };
      recurringMix = {
        updatedAt: parsed.updatedAt ?? null,
        appliesTo:
          parsed.appliesTo === "next_cycle" || parsed.appliesTo === "following_cycle"
            ? parsed.appliesTo
            : recurringMix.appliesTo,
        cutoffAt: parsed.cutoffAt ?? recurringMix.cutoffAt,
        nextRenewalAt: parsed.nextRenewalAt ?? cycleEndIso,
        cycleEffectiveAt: parsed.cycleEffectiveAt ?? cycleEndIso,
        lines: normalizeMixLines(parsed.lines),
      };
    } catch {
      // Return defaults if payload is invalid.
    }
  }

  const timingNow = computeCutoff(cycleEndIso);
  return NextResponse.json(
    {
      plan: {
        key: summary.planKey,
        name: summary.planName,
        status: summary.status,
        billingCadence: "Monthly",
        allowance: {
          photos: summary.includedImages,
          videos: summary.includedVideos,
        },
        nextRenewalAt: cycleEndIso,
      },
      timing: {
        cutoffAt: timingNow.cutoffAt,
        editsApplyTo: timingNow.appliesTo,
      },
      cycleUsage: {
        photosUsed: usedPhotos,
        videosUsed: usedVideos,
        photosRemaining: Math.max(0, summary.includedImages - usedPhotos),
        videosRemaining: Math.max(0, summary.includedVideos - usedVideos),
      },
      recurringMix,
    },
    { status: 200 }
  );
}
