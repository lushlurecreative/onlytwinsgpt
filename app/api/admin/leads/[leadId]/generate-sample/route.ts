import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { isAdminUser } from "@/lib/admin";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import {
  getPresetIdBySceneKey,
  createGenerationJob,
  pollAllGenerationJobsUntilDone,
} from "@/lib/generation-jobs";

type Params = { params: Promise<{ leadId: string }> };

export async function POST(request: Request, { params }: Params) {
  const { leadId } = await params;
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
  const { data: lead, error: leadError } = await admin
    .from("leads")
    .select("id, handle, sample_paths")
    .eq("id", leadId)
    .single();

  if (leadError || !lead) {
    return NextResponse.json({ error: leadError?.message ?? "Lead not found" }, { status: 404 });
  }

  const samplePaths = (lead.sample_paths ?? []) as string[];
  if (samplePaths.length === 0) {
    return NextResponse.json(
      { error: "Lead has no scraped sample photos." },
      { status: 400 }
    );
  }

  const scenePreset = "beach";
  const presetId = await getPresetIdBySceneKey(scenePreset);
  if (!presetId) {
    return NextResponse.json(
      { error: "Preset not found. Run migrations to seed presets." },
      { status: 400 }
    );
  }

  const referencePath = samplePaths[0];
  const jobIds: string[] = [];
  for (let i = 0; i < 2; i++) {
    const id = await createGenerationJob({
      subject_id: null,
      preset_id: presetId,
      reference_image_path: referencePath,
      lora_model_reference: null,
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
      {
        error: firstError ?? "Generation failed or timed out. Ensure the RunPod worker is running and WORKER_SECRET is set.",
      },
      { status: 500 }
    );
  }

  const samplePreviewPath = output_paths[0];

  const { error: updateError } = await admin
    .from("leads")
    .update({
      sample_preview_path: samplePreviewPath,
      generated_sample_paths: output_paths,
    })
    .eq("id", leadId);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 400 });
  }

  return NextResponse.json(
    {
      ok: true,
      generated: output_paths.length,
      samplePreviewPath,
      generatedSamplePaths: output_paths,
    },
    { status: 200 }
  );
}
