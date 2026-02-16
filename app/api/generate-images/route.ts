import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { getScenePresetByKey } from "@/lib/scene-presets";
import { generateImages } from "@/lib/ai/generate-images";

type GenerateBody = {
  sourcePath?: string;
  scenePreset?: string;
  count?: number;
  visibility?: "public" | "subscribers";
  contentMode?: "sfw" | "mature";
};

function sanitizeFileBase(value: string) {
  return value.replace(/[^a-z0-9_-]/gi, "-").toLowerCase();
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

  let body: GenerateBody = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const sourcePath = body.sourcePath?.trim();
  if (!sourcePath || !sourcePath.startsWith(`${user.id}/`)) {
    return NextResponse.json({ error: "Valid sourcePath owned by current user is required" }, { status: 400 });
  }

  const scene = getScenePresetByKey(body.scenePreset ?? "");
  if (!scene) {
    return NextResponse.json({ error: "Invalid scenePreset" }, { status: 400 });
  }

  const count = Math.max(1, Math.min(10, Number(body.count ?? 1)));
  const visibility = body.visibility === "subscribers" ? "subscribers" : "public";
  const contentMode = body.contentMode === "mature" ? "mature" : "sfw";

  const { data: sourceFile, error: sourceError } = await supabase.storage
    .from("uploads")
    .download(sourcePath);
  if (sourceError || !sourceFile) {
    return NextResponse.json({ error: sourceError?.message ?? "Could not download source image" }, { status: 400 });
  }

  const sourceExt = sourcePath.split(".").pop()?.toLowerCase() ?? "png";
  let generated;
  try {
    generated = await generateImages({
      sourceFile,
      sourceExt,
      scenePreset: scene.key,
      count,
      contentMode,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Image generation failed" },
      { status: 400 }
    );
  }

  const created: Array<{ path: string; signedUrl: string | null; postId: string }> = [];
  const createdAt = Date.now();

  for (let i = 0; i < generated.images.length; i += 1) {
    const bytes = generated.images[i];
    const objectPath = `${user.id}/generated/${sanitizeFileBase(scene.key)}-${createdAt}-${i + 1}.png`;

    const { error: uploadError } = await supabase.storage.from("uploads").upload(objectPath, bytes, {
      contentType: "image/png",
      upsert: false,
    });
    if (uploadError) {
      return NextResponse.json({ error: uploadError.message }, { status: 400 });
    }

    const caption = generated.caption;
    const { data: post, error: postError } = await supabase
      .from("posts")
      .insert({
        creator_id: user.id,
        storage_path: objectPath,
        caption,
        visibility,
      })
      .select("id")
      .single();

    if (postError || !post?.id) {
      return NextResponse.json({ error: postError?.message ?? "Failed to create generated post row" }, { status: 400 });
    }

    const { data: signedData } = await supabase.storage
      .from("uploads")
      .createSignedUrl(objectPath, 60 * 60);

    created.push({
      path: objectPath,
      signedUrl: signedData?.signedUrl ?? null,
      postId: post.id,
    });
  }

  if (created.length === 0) {
    return NextResponse.json({ error: "No images returned from generator" }, { status: 400 });
  }

  return NextResponse.json({ generated: created }, { status: 201 });
}

