import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

export async function GET(request: NextRequest) {
  const admin = getSupabaseAdmin();
  const type = request.nextUrl.searchParams.get("type") ?? "image";

  const { data, error } = await admin
    .from("presets")
    .select("id, name, type, status, prompt, negative_prompt, thumbnail_path, camera_instructions, pose_instructions, wardrobe_tags, environment_tags, sort_order, parameter_json, provider_defaults_json")
    .eq("type", type)
    .eq("status", "active")
    .order("sort_order", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  const scenes = (data ?? []).map((row) => ({
    id: row.id,
    name: row.name,
    type: row.type,
    prompt: row.prompt,
    negative_prompt: row.negative_prompt,
    thumbnail_path: row.thumbnail_path,
    camera_instructions: row.camera_instructions,
    pose_instructions: row.pose_instructions,
    wardrobe_tags: row.wardrobe_tags,
    environment_tags: row.environment_tags,
    sort_order: row.sort_order,
  }));

  return NextResponse.json({ scenes }, { status: 200 });
}
