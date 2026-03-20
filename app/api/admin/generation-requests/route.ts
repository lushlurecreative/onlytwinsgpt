import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { isAdminUser } from "@/lib/admin";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isAdminUser(user.id, user.email)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const userId = searchParams.get("user_id")?.trim() || undefined;

  const admin = getSupabaseAdmin();
  let q = admin
    .from("generation_requests")
    .select(
      "id, user_id, sample_paths, output_paths, scene_preset, content_mode, image_count, video_count, status, admin_notes, progress_done, progress_total, retry_count, created_at, updated_at"
    )
    .order("created_at", { ascending: false })
    .limit(userId ? 100 : 200);
  if (userId) q = q.eq("user_id", userId);
  const { data, error } = await q;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  // Attach customer names when fetching globally.
  const rows = data ?? [];
  if (!userId && rows.length > 0) {
    const uniqueUserIds = [...new Set(rows.map((r) => r.user_id as string))];
    const { data: profiles } = await admin
      .from("profiles")
      .select("id, full_name")
      .in("id", uniqueUserIds);
    const nameMap = Object.fromEntries((profiles ?? []).map((p) => [p.id, p.full_name as string | null]));
    return NextResponse.json({
      requests: rows.map((r) => ({ ...r, customer_name: nameMap[r.user_id as string] ?? null })),
    });
  }

  return NextResponse.json({ requests: rows }, { status: 200 });
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isAdminUser(user.id, user.email)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: {
    userId?: string;
    scenePreset?: string;
    imageCount?: number;
    videoCount?: number;
    contentMode?: string;
    samplePaths?: string[];
  } = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.userId) return NextResponse.json({ error: "userId required" }, { status: 400 });
  if (!body.scenePreset) return NextResponse.json({ error: "scenePreset required" }, { status: 400 });

  const samplePaths = (body.samplePaths ?? []).filter(Boolean);
  const imageCount = Math.max(1, Math.min(250, Number(body.imageCount ?? 10)));
  const videoCount = Math.max(0, Math.min(20, Number(body.videoCount ?? 0)));
  const contentMode = body.contentMode === "mature" ? "mature" : "sfw";

  const admin = getSupabaseAdmin();
  const { data: inserted, error: insertError } = await admin
    .from("generation_requests")
    .insert({
      user_id: body.userId,
      scene_preset: body.scenePreset,
      image_count: imageCount,
      video_count: videoCount,
      content_mode: contentMode,
      sample_paths: samplePaths,
      status: "pending",
      source: "admin_initiated",
    })
    .select("id")
    .single();

  if (insertError || !inserted) {
    return NextResponse.json({ error: insertError?.message ?? "Failed to create request" }, { status: 400 });
  }

  return NextResponse.json({ request: { id: inserted.id } }, { status: 201 });
}

