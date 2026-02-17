import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { getScenePresetByKey } from "@/lib/scene-presets";
import {
  getApprovedSubjectIdForUser,
  getLoraReferenceForSubject,
  getPresetIdBySceneKey,
  createGenerationJob,
  pollAllGenerationJobsUntilDone,
} from "@/lib/generation-jobs";

type GenerateBody = {
  sourcePath?: string;
  scenePreset?: string;
  count?: number;
  visibility?: "public" | "subscribers";
  contentMode?: "sfw" | "mature";
};

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

  const subjectId = await getApprovedSubjectIdForUser(user.id);
  if (!subjectId) {
    return NextResponse.json(
      { error: "No approved subject. Consent required for generation." },
      { status: 400 }
    );
  }

  const presetId = await getPresetIdBySceneKey(scene.key);
  if (!presetId) {
    return NextResponse.json({ error: "Preset not found." }, { status: 400 });
  }

  const loraRef = await getLoraReferenceForSubject(subjectId);
  const jobIds: string[] = [];
  for (let i = 0; i < count; i++) {
    const id = await createGenerationJob({
      subject_id: subjectId,
      preset_id: presetId,
      reference_image_path: sourcePath,
      lora_model_reference: loraRef,
      generation_request_id: null,
    });
    if (id) jobIds.push(id);
  }

  if (jobIds.length === 0) {
    return NextResponse.json({ error: "Failed to create generation jobs" }, { status: 500 });
  }

  const { output_paths, allOk, firstError } = await pollAllGenerationJobsUntilDone(jobIds);
  if (!allOk || output_paths.length === 0) {
    return NextResponse.json(
      { error: firstError ?? "Generation failed or timed out. Ensure the RunPod worker is running." },
      { status: 500 }
    );
  }

  const caption = `OnlyTwins ${scene.label} set`;
  const created: Array<{ path: string; signedUrl: string | null; postId: string }> = [];

  for (const objectPath of output_paths) {
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
      continue;
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
    return NextResponse.json({ error: "Failed to create post records" }, { status: 500 });
  }

  return NextResponse.json({ generated: created }, { status: 201 });
}
