import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { isAdminUser } from "@/lib/admin";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { generateImages } from "@/lib/ai/generate-images";
import { generateVideo } from "@/lib/video-generation";
import { getScenePresetByKey } from "@/lib/scene-presets";

type Params = {
  params: Promise<{ requestId: string }>;
};

type RequestRow = {
  id: string;
  user_id: string;
  sample_paths: string[];
  scene_preset: string;
  content_mode: "sfw" | "mature";
  image_count: number;
  video_count: number;
  status: string;
  retry_count: number;
  output_paths: string[];
};

function sanitizeFileBase(value: string) {
  return value.replace(/[^a-z0-9_-]/gi, "-").toLowerCase();
}

export async function POST(_request: Request, { params }: Params) {
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

  const admin = getSupabaseAdmin();
  const { data: reqData, error: reqError } = await admin
    .from("generation_requests")
    .select(
      "id, user_id, sample_paths, scene_preset, content_mode, image_count, video_count, status, retry_count, output_paths"
    )
    .eq("id", requestId)
    .single();

  if (reqError || !reqData) {
    return NextResponse.json({ error: reqError?.message ?? "Request not found" }, { status: 404 });
  }

  const requestRow = reqData as unknown as RequestRow;
  const contentMode = requestRow.content_mode === "mature" ? "mature" : "sfw";
  if (requestRow.status !== "approved" && requestRow.status !== "failed") {
    return NextResponse.json(
      { error: "Request must be approved (or previously failed) before generation" },
      { status: 400 }
    );
  }

  const total = Math.max(1, requestRow.image_count) + Math.max(0, requestRow.video_count);
  let done = 0;
  let retries = requestRow.retry_count ?? 0;
  const outputPaths = [...(requestRow.output_paths ?? [])];

  await admin
    .from("generation_requests")
    .update({
      status: "generating",
      progress_done: 0,
      progress_total: total,
    })
    .eq("id", requestId);

  for (let i = 0; i < requestRow.image_count; i += 1) {
    const sourcePath = requestRow.sample_paths[i % requestRow.sample_paths.length];
    const { data: sourceFile, error: sourceError } = await admin.storage
      .from("uploads")
      .download(sourcePath);
    if (sourceError || !sourceFile) {
      retries += 1;
      continue;
    }
    const sourceExt = sourcePath.split(".").pop()?.toLowerCase() ?? "png";

    let success = false;
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      try {
        const generated = await generateImages({
          sourceFile,
          sourceExt,
          scenePreset: requestRow.scene_preset,
          count: 1,
          contentMode,
        });
        const bytes = generated.images[0];
        const objectPath = `${requestRow.user_id}/generated/request-${sanitizeFileBase(requestRow.scene_preset)}-${requestId}-${i + 1}.jpg`;
        const { error: uploadError } = await admin.storage.from("uploads").upload(objectPath, bytes, {
          contentType: "image/jpeg",
          upsert: false,
        });
        if (uploadError) {
          throw new Error(uploadError.message);
        }
        const { error: postError } = await admin.from("posts").insert({
          creator_id: requestRow.user_id,
          storage_path: objectPath,
          caption: generated.caption,
          visibility: "subscribers",
          is_published: false,
        });
        if (postError) {
          throw new Error(postError.message);
        }
        outputPaths.push(objectPath);
        done += 1;
        success = true;
        break;
      } catch {
        retries += 1;
      }
    }

    await admin
      .from("generation_requests")
      .update({
        progress_done: done,
        retry_count: retries,
        output_paths: outputPaths,
      })
      .eq("id", requestId);

    if (!success) {
      // Continue processing remaining images to maximize successful output.
    }
  }

  const videoRequested = requestRow.video_count > 0;
  let videosDone = 0;
  if (videoRequested && outputPaths.length > 0) {
    const scenePreset = getScenePresetByKey(requestRow.scene_preset);
    const motionPrompt = scenePreset?.prompt ?? "Smooth, natural motion with subtle movement.";
    for (let v = 0; v < requestRow.video_count; v += 1) {
      const sourcePath = outputPaths[v % outputPaths.length];
      const { data: imgBlob, error: imgErr } = await admin.storage.from("uploads").download(sourcePath);
      if (imgErr || !imgBlob) {
        retries += 1;
        continue;
      }
      const arr = new Uint8Array(await imgBlob.arrayBuffer());
      const b64 = Buffer.from(arr).toString("base64");
      const dataUri = `data:image/jpeg;base64,${b64}`;
      try {
        const { videoUrl } = await generateVideo({
          imageUrl: dataUri,
          prompt: motionPrompt,
        });
        const vidRes = await fetch(videoUrl);
        if (!vidRes.ok) throw new Error("Failed to fetch video");
        const vidBytes = new Uint8Array(await vidRes.arrayBuffer());
        const vidPath = `${requestRow.user_id}/generated/request-${sanitizeFileBase(requestRow.scene_preset)}-${requestId}-vid-${v + 1}.mp4`;
        const { error: vidUpErr } = await admin.storage.from("uploads").upload(vidPath, vidBytes, {
          contentType: "video/mp4",
          upsert: false,
        });
        if (vidUpErr) throw new Error(vidUpErr.message);
        outputPaths.push(vidPath);
        videosDone += 1;
        done += 1;
        await admin
          .from("generation_requests")
          .update({
            progress_done: done,
            output_paths: outputPaths,
          })
          .eq("id", requestId);
      } catch {
        retries += 1;
      }
    }
  } else if (videoRequested && outputPaths.length === 0) {
    retries += requestRow.video_count;
  }

  const targetTotal = requestRow.image_count + requestRow.video_count;
  const finalStatus = done >= targetTotal ? "completed" : "failed";
  let adminNotes: string | null = null;
  if (videoRequested && videosDone < requestRow.video_count) {
    adminNotes = `Videos: ${videosDone}/${requestRow.video_count} succeeded. Ensure REPLICATE_API_TOKEN is set in Vercel for video generation.`;
  }

  await admin
    .from("generation_requests")
    .update({
      status: finalStatus,
      progress_done: done,
      progress_total: total,
      retry_count: retries,
      output_paths: outputPaths,
      admin_notes: adminNotes,
    })
    .eq("id", requestId);

  return NextResponse.json(
    {
      requestId,
      status: finalStatus,
      generatedImages: done - videosDone,
      generatedVideos: videosDone,
      requestedImages: requestRow.image_count,
      requestedVideos: requestRow.video_count,
      contentMode,
      retries,
    },
    { status: 200 }
  );
}

