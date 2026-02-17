import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { getPresetIdBySceneKey, createGenerationJob } from "@/lib/generation-jobs";

const DEFAULT_MAX_PER_RUN = 10;

function getCronSecret(): string {
  return process.env.CRON_SECRET?.trim() || "";
}

/** GET: Enqueue qualified leads as lead_sample generation jobs (idempotent). Secured by CRON_SECRET. */
export async function GET(request: Request) {
  const secret = getCronSecret();
  const auth = request.headers.get("authorization") || "";
  const bearer = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (secret && bearer !== secret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = getSupabaseAdmin();
  const [
    { data: maxRow },
    { data: budgetRow },
  ] = await Promise.all([
    admin.from("app_settings").select("value").eq("key", "lead_sample_max_per_run").maybeSingle(),
    admin.from("app_settings").select("value").eq("key", "lead_sample_daily_budget_usd").maybeSingle(),
  ]);
  const maxPerRun = Math.max(1, parseInt(String(maxRow?.value ?? DEFAULT_MAX_PER_RUN), 10) || DEFAULT_MAX_PER_RUN);
  const dailyBudgetUsd = parseFloat(String(budgetRow?.value ?? "0")) || 0;
  if (dailyBudgetUsd > 0) {
    const todayStart = new Date();
    todayStart.setUTCHours(0, 0, 0, 0);
    const { data: sumRows } = await admin
      .from("gpu_usage")
      .select("cost_usd")
      .eq("job_type", "lead_sample")
      .gte("created_at", todayStart.toISOString());
    const spent =
      (sumRows ?? []).reduce((s, r) => s + (Number((r as { cost_usd?: number | null }).cost_usd) || 0), 0);
    if (spent >= dailyBudgetUsd) {
      return NextResponse.json({ ok: true, enqueued: 0, reason: "daily_budget_reached" });
    }
  }

  const presetId = await getPresetIdBySceneKey("beach");
  if (!presetId) {
    return NextResponse.json({ error: "Preset not found. Run migrations to seed presets." }, { status: 500 });
  }

  const { data: qualified } = await admin
    .from("leads")
    .select("id, image_urls_json, sample_paths")
    .eq("status", "qualified")
    .order("updated_at", { ascending: true })
    .limit(maxPerRun * 2);

  if (!qualified?.length) {
    return NextResponse.json({ ok: true, enqueued: 0 });
  }

  let enqueued = 0;
  for (const lead of qualified) {
    if (enqueued >= maxPerRun) break;
    const key = `lead_sample:${lead.id}`;
    const { data: existing } = await admin
      .from("idempotency_keys")
      .select("key")
      .eq("key", key)
      .maybeSingle();
    if (existing) continue;

    const urls = lead.image_urls_json;
    let referenceImage: string | null = null;
    if (Array.isArray(urls) && urls.length > 0 && typeof urls[0] === "string" && (urls[0] as string).startsWith("http")) {
      referenceImage = urls[0] as string;
    }
    const paths = (lead.sample_paths ?? []) as string[];
    if (!referenceImage && paths.length > 0) referenceImage = paths[0] || null;
    if (!referenceImage) continue;

    const jobId = await createGenerationJob({
      subject_id: null,
      preset_id: presetId,
      reference_image_path: referenceImage,
      lora_model_reference: null,
      generation_request_id: null,
      job_type: "lead_sample",
      lead_id: lead.id,
    });
    if (!jobId) continue;

    await admin.from("leads").update({ status: "sample_queued", updated_at: new Date().toISOString() }).eq("id", lead.id);
    await admin.from("idempotency_keys").insert({ key });
    await admin.from("automation_events").insert({
      event_type: "job_enqueued",
      entity_type: "lead",
      entity_id: lead.id,
      payload_json: { generation_job_id: jobId, source: "cron_enqueue" },
    });
    enqueued++;
  }

  return NextResponse.json({ ok: true, enqueued });
}
