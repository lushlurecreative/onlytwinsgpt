import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { isAdminUser } from "@/lib/admin";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import {
  getPresetIdBySceneKey,
  createGenerationJob,
} from "@/lib/generation-jobs";

type Params = { params: Promise<{ leadId: string }> };

/** Get first reference image: URL from image_urls_json or path from sample_paths. */
function getLeadReferenceImage(lead: {
  image_urls_json?: unknown;
  sample_paths?: string[];
}): string | null {
  const urls = lead.image_urls_json;
  if (Array.isArray(urls) && urls.length > 0) {
    const first = urls[0];
    if (typeof first === "string" && first.startsWith("http")) return first;
  }
  if (typeof urls === "object" && urls !== null && "url" in (urls as Record<string, unknown>)) {
    const u = (urls as { url?: string }).url;
    if (typeof u === "string" && u.startsWith("http")) return u;
  }
  const paths = (lead.sample_paths ?? []) as string[];
  if (paths.length > 0 && paths[0]) return paths[0];
  return null;
}

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
    .select("id, handle, sample_paths, image_urls_json")
    .eq("id", leadId)
    .single();

  if (leadError || !lead) {
    return NextResponse.json({ error: leadError?.message ?? "Lead not found" }, { status: 404 });
  }

  const referenceImage = getLeadReferenceImage(lead);
  if (!referenceImage) {
    return NextResponse.json(
      { error: "Lead has no reference image (set image_urls_json or sample_paths)." },
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

  await admin
    .from("leads")
    .update({ status: "sample_queued", updated_at: new Date().toISOString() })
    .eq("id", leadId);

  const jobId = await createGenerationJob({
    subject_id: null,
    preset_id: presetId,
    reference_image_path: referenceImage,
    lora_model_reference: null,
    generation_request_id: null,
    job_type: "lead_sample",
    lead_id: leadId,
  });

  if (!jobId) {
    await admin
      .from("leads")
      .update({ status: "qualified", updated_at: new Date().toISOString() })
      .eq("id", leadId);
    return NextResponse.json({ error: "Failed to create generation job (RunPod may be unconfigured)." }, { status: 500 });
  }

  await admin.from("automation_events").insert({
    event_type: "job_enqueued",
    entity_type: "lead",
    entity_id: leadId,
    payload_json: { generation_job_id: jobId, source: "admin_generate_sample" },
  });

  return NextResponse.json(
    { ok: true, message: "Sample generation queued.", generation_job_id: jobId },
    { status: 202 }
  );
}
