import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { isAdminUser } from "@/lib/admin";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { generateImages } from "@/lib/ai/generate-images";

type Params = { params: Promise<{ leadId: string }> };

export async function POST(_request: Request, { params }: Params) {
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
      { error: "Lead has no scraped sample photos. Antigravity must provide sampleUrls or samplePaths." },
      { status: 400 }
    );
  }

  const sourcePath = samplePaths[0];
  const { data: sourceFile, error: sourceError } = await admin.storage.from("uploads").download(sourcePath);
  if (sourceError || !sourceFile) {
    return NextResponse.json({ error: "Failed to load sample image" }, { status: 400 });
  }

  const sourceExt = sourcePath.split(".").pop()?.toLowerCase() ?? "jpg";

  let generatedCount = 0;
  const outputPaths: string[] = [];
  const scenePreset = "beach";

  try {
    const result = await generateImages({
      sourceFile,
      sourceExt,
      scenePreset,
      count: 2,
      contentMode: "sfw",
    });
    const folder = `leads/${leadId}/generated`;
    for (let i = 0; i < result.images.length; i += 1) {
      const bytes = result.images[i];
      const objectPath = `${folder}/sample-${i + 1}.jpg`;
      const { error: uploadError } = await admin.storage.from("uploads").upload(objectPath, bytes, {
        contentType: "image/jpeg",
        upsert: true,
      });
      if (!uploadError) {
        outputPaths.push(objectPath);
        generatedCount += 1;
      }
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: `Generation failed: ${msg}` }, { status: 500 });
  }

  if (outputPaths.length === 0) {
    return NextResponse.json({ error: "No images generated" }, { status: 500 });
  }

  const samplePreviewPath = outputPaths[0];

  const { error: updateError } = await admin
    .from("leads")
    .update({
      sample_preview_path: samplePreviewPath,
      generated_sample_paths: outputPaths,
    })
    .eq("id", leadId);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 400 });
  }

  return NextResponse.json(
    { ok: true, generated: generatedCount, samplePreviewPath, generatedSamplePaths: outputPaths },
    { status: 200 }
  );
}
