import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import {
  computeCutoff,
  getCurrentSubscriptionSummary,
  normalizeMixLines,
} from "@/lib/request-planner";
import { createGenerationRequestWithUsage } from "@/lib/generation-request-intake";

const SETTINGS_PREFIX = "request_mix:";

function selectScenePreset(lines: ReturnType<typeof normalizeMixLines>) {
  const text = lines.map((line) => line.prompt.toLowerCase()).join(" ");
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

function inferContentMode(lines: ReturnType<typeof normalizeMixLines>): "sfw" | "mature" {
  const text = lines.map((line) => line.prompt.toLowerCase()).join(" ");
  if (text.includes("nsfw") || text.includes("adult") || text.includes("explicit")) return "mature";
  return "sfw";
}

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
  const key = `${SETTINGS_PREFIX}${userId}`;
  const { data: row, error } = await admin
    .from("app_settings")
    .select("value")
    .eq("key", key)
    .maybeSingle();
  if (error || !row?.value) {
    return NextResponse.json({ preferences: null }, { status: 200 });
  }

  try {
    const parsed = JSON.parse(row.value) as {
      preset?: string;
      lines?: unknown[];
      updatedAt?: string;
      appliesTo?: "next_cycle" | "following_cycle";
      cutoffAt?: string | null;
      nextRenewalAt?: string | null;
      cycleEffectiveAt?: string | null;
    };
    return NextResponse.json(
      {
        preferences: {
          preset: parsed.preset ?? "custom",
          allocationRows: normalizeMixLines(parsed.lines).map((line) => ({
            id: line.id,
            kind: line.type,
            count: line.quantity,
            direction: line.prompt,
          })),
          updatedAt: parsed.updatedAt ?? null,
          appliesTo: parsed.appliesTo ?? null,
          cutoffAt: parsed.cutoffAt ?? null,
          nextRenewalAt: parsed.nextRenewalAt ?? null,
          cycleEffectiveAt: parsed.cycleEffectiveAt ?? null,
        },
      },
      { status: 200 }
    );
  } catch {
    return NextResponse.json({ preferences: null }, { status: 200 });
  }
}

export async function PUT(request: Request) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "Invalid payload" }, { status: 400 });

  const summary = await getCurrentSubscriptionSummary(getSupabaseAdmin(), userId);
  const nextRenewalAt = summary.nextRenewalAt;
  const timing = computeCutoff(nextRenewalAt);
  const lines = normalizeMixLines(body.allocationRows ?? body.lines);
  const totalPhotos = lines.filter((line) => line.type === "photo").reduce((sum, line) => sum + line.quantity, 0);
  const totalVideos = lines.filter((line) => line.type === "video").reduce((sum, line) => sum + line.quantity, 0);
  if (lines.length === 0) {
    return NextResponse.json({ error: "Add at least one request line before saving." }, { status: 400 });
  }
  if (totalPhotos > summary.includedImages || totalVideos > summary.includedVideos) {
    return NextResponse.json(
      {
        error: "Requested totals exceed your current monthly allowance.",
        limits: { photos: summary.includedImages, videos: summary.includedVideos },
      },
      { status: 400 }
    );
  }

  const admin = getSupabaseAdmin();
  const key = `${SETTINGS_PREFIX}${userId}`;
  const serialized = JSON.stringify({
    preset: String(body.preset ?? "custom"),
    lines,
    totals: { photos: totalPhotos, videos: totalVideos },
    nextRenewalAt,
    cutoffAt: timing.cutoffAt,
    appliesTo: timing.appliesTo,
    cycleEffectiveAt: nextRenewalAt,
    updatedAt: new Date().toISOString(),
  });

  const { error } = await admin
    .from("app_settings")
    .upsert({ key, value: serialized, updated_at: new Date().toISOString() }, { onConflict: "key" });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  const cycleEndIso = nextRenewalAt;
  let cycleStartIso: string | null = null;
  if (cycleEndIso) {
    const end = new Date(cycleEndIso);
    cycleStartIso = new Date(end.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
  }

  let generationState:
    | "queued_now"
    | "saved_for_next_cycle"
    | "current_cycle_already_queued"
    | "saved_pending_training"
    | "saved_pending_eligibility" = "saved_for_next_cycle";
  let generationMessage =
    "Your recurring request mix has been saved. If you do not update before cutoff, this mix repeats next cycle.";
  const nextRenewalLabel = nextRenewalAt
    ? new Date(nextRenewalAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
    : "your next cycle";

  const eligibleStatus = ["active", "trialing"].includes(String(summary.status ?? "").toLowerCase());
  if (!eligibleStatus) {
    generationState = "saved_pending_eligibility";
    generationMessage = "Saved. Your plan is not currently eligible for generation. Update billing to resume queueing.";
  } else {
    const { data: uploadList } = await admin.storage.from("uploads").list(`${userId}/training`, {
      limit: 100,
      offset: 0,
      sortBy: { column: "created_at", order: "desc" },
    });
    const samplePaths = (uploadList ?? [])
      .map((obj) => `${userId}/training/${obj.name}`)
      .filter((path) => /\.(jpg|jpeg|png|webp|gif)$/i.test(path))
      .slice(0, 10);

    if (samplePaths.length < 10) {
      generationState = "saved_pending_training";
      generationMessage = `Saved. Upload at least 10 training photos before your monthly batch can be queued for ${nextRenewalLabel}.`;
    } else if (cycleStartIso && cycleEndIso) {
      const { data: existingRows } = await admin
        .from("generation_requests")
        .select("id")
        .eq("user_id", userId)
        .gte("created_at", cycleStartIso)
        .lt("created_at", cycleEndIso)
        .limit(1);
      if ((existingRows ?? []).length > 0) {
        generationState = "current_cycle_already_queued";
        generationMessage = `Saved. Current cycle already queued. Your updated mix is set for ${nextRenewalLabel}.`;
      } else {
        const scenePreset = selectScenePreset(lines);
        const contentMode = inferContentMode(lines);
        const queued = await createGenerationRequestWithUsage(admin, {
          userId,
          samplePaths,
          scenePreset,
          imageCount: totalPhotos,
          videoCount: totalVideos,
          contentMode,
          idempotencyKey: `request-mix-save:${userId}:${new Date().toISOString().slice(0, 10)}`,
        });
        if (queued.ok) {
          generationState = "queued_now";
          generationMessage = "Your monthly content batch has been queued.";
        } else {
          generationState = "saved_for_next_cycle";
          generationMessage =
            `Saved. We could not queue this cycle immediately, but your mix is saved for ${nextRenewalLabel}.`;
        }
      }
    }
  }

  return NextResponse.json(
    {
      ok: true,
      appliesTo: timing.appliesTo,
      cutoffAt: timing.cutoffAt,
      nextRenewalAt,
      cycleEffectiveAt: nextRenewalAt,
      generationState,
      generationMessage,
    },
    { status: 200 }
  );
}
