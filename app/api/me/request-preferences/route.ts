import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import {
  computeCutoff,
  getCurrentSubscriptionSummary,
  normalizeMixLines,
} from "@/lib/request-planner";

const SETTINGS_PREFIX = "request_mix:";

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

  return NextResponse.json(
    {
      ok: true,
      appliesTo: timing.appliesTo,
      cutoffAt: timing.cutoffAt,
      nextRenewalAt,
      cycleEffectiveAt: nextRenewalAt,
    },
    { status: 200 }
  );
}
