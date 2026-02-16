import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { isAdminUser } from "@/lib/admin";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { getScenePresetByKey } from "@/lib/scene-presets";

type Params = { params: Promise<{ requestId: string }> };

type Body = {
  scenePreset?: string;
  contentMode?: "sfw" | "mature";
  imageCount?: number;
  videoCount?: number;
  adminNotes?: string | null;
  samplePaths?: string[];
  removeSamplePath?: string;
  requestNewPhotos?: boolean;
};

export async function PATCH(request: Request, { params }: Params) {
  const { requestId } = await params;

  const session = await createClient();
  const {
    data: { user },
    error: userError,
  } = await session.auth.getUser();

  if (userError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isAdminUser(user.id)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: Body = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const patch: Record<string, unknown> = {};

  if (typeof body.scenePreset === "string" && body.scenePreset.trim()) {
    const key = body.scenePreset.trim();
    if (!getScenePresetByKey(key)) {
      return NextResponse.json({ error: "Invalid scenePreset" }, { status: 400 });
    }
    patch.scene_preset = key;
  }
  if (body.contentMode === "sfw" || body.contentMode === "mature") {
    patch.content_mode = body.contentMode;
  }
  if (typeof body.imageCount === "number") {
    const value = Math.max(1, Math.min(50, Math.floor(body.imageCount)));
    patch.image_count = value;
  }
  if (typeof body.videoCount === "number") {
    const value = Math.max(0, Math.min(10, Math.floor(body.videoCount)));
    patch.video_count = value;
  }
  if (typeof body.adminNotes === "string") {
    patch.admin_notes = body.adminNotes.trim() || null;
  }
  if (body.adminNotes === null) {
    patch.admin_notes = null;
  }

  const admin = getSupabaseAdmin();

  const { data: existing, error: existingError } = await admin
    .from("generation_requests")
    .select("id, status, admin_notes, sample_paths")
    .eq("id", requestId)
    .single();

  if (existingError || !existing) {
    return NextResponse.json({ error: existingError?.message ?? "Request not found" }, { status: 404 });
  }

  const existingRow = existing as { status: string; admin_notes?: string | null; sample_paths?: string[] };
  if (["generating", "completed"].includes(existingRow.status)) {
    return NextResponse.json({ error: "Cannot edit after generation starts" }, { status: 400 });
  }

  if (body.requestNewPhotos) {
    const note = `[${new Date().toISOString()}] Admin requested new training photos. Creator: please re-upload in Training Vault.`;
    patch.admin_notes = existingRow.admin_notes ? `${existingRow.admin_notes}\n\n${note}` : note;
    patch.status = "pending";
  }

  if (Array.isArray(body.samplePaths) && body.samplePaths.length >= 1) {
    patch.sample_paths = body.samplePaths;
  }
  if (typeof body.removeSamplePath === "string" && body.removeSamplePath.trim()) {
    const paths = (existingRow.sample_paths ?? []) as string[];
    const toRemove = body.removeSamplePath.trim();
    const next = paths.filter((p) => p !== toRemove);
    if (next.length < 1) {
      return NextResponse.json({ error: "Cannot remove last sample; at least 1 required" }, { status: 400 });
    }
    patch.sample_paths = next;
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
  }

  const { data, error } = await admin
    .from("generation_requests")
    .update(patch)
    .eq("id", requestId)
    .select(
      "id, user_id, sample_paths, scene_preset, content_mode, image_count, video_count, status, admin_notes, progress_done, progress_total, retry_count, created_at, updated_at"
    )
    .single();

  if (error || !data) {
    return NextResponse.json({ error: error?.message ?? "Update failed" }, { status: 400 });
  }

  return NextResponse.json({ request: data }, { status: 200 });
}

