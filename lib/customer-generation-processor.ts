import type { SupabaseClient } from "@supabase/supabase-js";
import { createGenerationJob, getApprovedSubjectIdForUser, getLoraReferenceForSubject, getPresetIdBySceneKey } from "@/lib/generation-jobs";
import { createCanonicalCustomerGenerationBatch } from "@/lib/customer-generation";
import { normalizeMixLines } from "@/lib/request-planner";
import { isGenerationEngineEnabled, logGenerationEngineDisabled } from "@/lib/generation-engine";

type GenerationRequestRow = {
  id: string;
  user_id: string;
  status: string;
  sample_paths: string[];
  cycle_start: string | null;
  cycle_end: string | null;
};

type GenerationRequestLine = {
  id: string;
  line_type: "photo" | "video";
  quantity: number;
  scene_preset: string;
  prompt: string;
  line_index: number;
};

function normalizeCycleFromSubscription(currentPeriodEnd: string | null) {
  const cycleEnd = currentPeriodEnd
    ? new Date(currentPeriodEnd)
    : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  const cycleStart = new Date(cycleEnd.getTime() - 30 * 24 * 60 * 60 * 1000);
  return {
    cycleStartIso: cycleStart.toISOString(),
    cycleEndIso: cycleEnd.toISOString(),
  };
}

async function claimRequest(admin: SupabaseClient, requestId: string) {
  const { data } = await admin
    .from("generation_requests")
    .update({ status: "generating", started_at: new Date().toISOString(), failed_at: null, completed_at: null })
    .eq("id", requestId)
    .eq("status", "pending")
    .select("id,user_id,status,sample_paths,cycle_start,cycle_end")
    .maybeSingle();
  return (data as GenerationRequestRow | null) ?? null;
}

async function ensureLines(admin: SupabaseClient, request: GenerationRequestRow) {
  const { data: existing } = await admin
    .from("generation_request_lines")
    .select("id,line_type,quantity,scene_preset,prompt,line_index")
    .eq("generation_request_id", request.id)
    .order("line_index", { ascending: true });
  const rows = (existing ?? []) as GenerationRequestLine[];
  if (rows.length > 0) return rows;

  const { data: req } = await admin
    .from("generation_requests")
    .select("mix_snapshot_json")
    .eq("id", request.id)
    .maybeSingle();
  const lines = normalizeMixLines((req as { mix_snapshot_json?: unknown } | null)?.mix_snapshot_json ?? []);
  if (lines.length === 0) return [];
  const insertedRows = lines.map((line, idx) => ({
    generation_request_id: request.id,
    line_index: idx,
    line_type: line.type,
    quantity: line.quantity,
    prompt: line.prompt,
    scene_preset: line.prompt.toLowerCase().includes("beach") ? "beach" : "gym",
    source: "user",
    metadata_json: { original_line_id: line.id },
  }));
  await admin.from("generation_request_lines").insert(insertedRows);
  const { data: afterInsert } = await admin
    .from("generation_request_lines")
    .select("id,line_type,quantity,scene_preset,prompt,line_index")
    .eq("generation_request_id", request.id)
    .order("line_index", { ascending: true });
  return (afterInsert ?? []) as GenerationRequestLine[];
}

export async function processPendingCustomerGeneration(admin: SupabaseClient, maxBatches = 10) {
  if (!isGenerationEngineEnabled()) {
    logGenerationEngineDisabled("request_processor");
    return [];
  }

  const nowIso = new Date().toISOString();
  const { data: candidates } = await admin
    .from("generation_requests")
    .select("id,user_id,status,sample_paths,cycle_start,cycle_end")
    .eq("status", "pending")
    .or(`cycle_start.is.null,cycle_start.lte.${nowIso}`)
    .order("created_at", { ascending: true })
    .limit(maxBatches);

  const processed: Array<{ requestId: string; jobsCreated: number }> = [];
  for (const candidate of (candidates ?? []) as GenerationRequestRow[]) {
    const claimed = await claimRequest(admin, candidate.id);
    if (!claimed) continue;

    const subjectId = await getApprovedSubjectIdForUser(claimed.user_id);
    if (!subjectId) {
      await admin
        .from("generation_requests")
        .update({
          status: "failed",
          failed_at: new Date().toISOString(),
          admin_notes: "No approved subject found for user.",
        })
        .eq("id", claimed.id);
      continue;
    }
    const loraRef = await getLoraReferenceForSubject(subjectId);
    const lines = await ensureLines(admin, claimed);
    const samplePaths = (claimed.sample_paths ?? []).filter(Boolean);
    if (samplePaths.length === 0 || lines.length === 0) {
      await admin
        .from("generation_requests")
        .update({
          status: "failed",
          failed_at: new Date().toISOString(),
          admin_notes: "Missing sample paths or request lines.",
        })
        .eq("id", claimed.id);
      continue;
    }

    let jobCount = 0;
    for (const line of lines) {
      if (line.line_type !== "photo") continue;
      const presetId = await getPresetIdBySceneKey(line.scene_preset);
      if (!presetId) continue;
      for (let i = 0; i < line.quantity; i += 1) {
        const referencePath = samplePaths[(jobCount + i) % samplePaths.length];
        const jobId = await createGenerationJob({
          subject_id: subjectId,
          preset_id: presetId,
          reference_image_path: referencePath,
          lora_model_reference: loraRef,
          generation_request_id: claimed.id,
        });
        if (jobId) {
          jobCount += 1;
          await admin
            .from("generation_jobs")
            .update({
              generation_request_line_id: line.id,
              prompt_override: line.prompt,
            })
            .eq("id", jobId);
        }
      }
    }

    if (jobCount === 0) {
      await admin
        .from("generation_requests")
        .update({
          status: "failed",
          failed_at: new Date().toISOString(),
          admin_notes: "No generation jobs could be created from request lines.",
        })
        .eq("id", claimed.id);
      continue;
    }

    processed.push({ requestId: claimed.id, jobsCreated: jobCount });
  }
  return processed;
}

export async function scheduleMonthlyCustomerBatches(admin: SupabaseClient, maxSubscribers = 200) {
  if (!isGenerationEngineEnabled()) {
    logGenerationEngineDisabled("monthly_scheduler");
    return [];
  }

  const now = new Date();
  const { data: subs } = await admin
    .from("subscriptions")
    .select("subscriber_id,current_period_end,status,created_at")
    .in("status", ["active", "trialing", "past_due"])
    .order("created_at", { ascending: false })
    .limit(maxSubscribers);

  const latestByUser = new Map<string, { subscriber_id: string; current_period_end: string | null }>();
  for (const row of (subs ?? []) as Array<{ subscriber_id?: string | null; current_period_end?: string | null }>) {
    const userId = row.subscriber_id ?? null;
    if (!userId || latestByUser.has(userId)) continue;
    latestByUser.set(userId, {
      subscriber_id: userId,
      current_period_end: row.current_period_end ?? null,
    });
  }

  const queued: string[] = [];
  for (const sub of latestByUser.values()) {
    const { cycleStartIso, cycleEndIso } = normalizeCycleFromSubscription(sub.current_period_end);
    const cycleStart = new Date(cycleStartIso);
    const cycleEnd = new Date(cycleEndIso);
    if (now < cycleStart || now >= cycleEnd) continue;

    const { data: existing } = await admin
      .from("generation_requests")
      .select("id")
      .eq("user_id", sub.subscriber_id)
      .eq("cycle_start", cycleStartIso)
      .eq("cycle_end", cycleEndIso)
      .limit(1);
    if ((existing ?? []).length > 0) continue;

    const { data: recurring } = await admin
      .from("recurring_request_mixes")
      .select("lines_json")
      .eq("user_id", sub.subscriber_id)
      .eq("applies_cycle_start", cycleStartIso)
      .limit(1)
      .maybeSingle();
    const lines = (recurring as { lines_json?: unknown } | null)?.lines_json ?? [];
    const normalized = normalizeMixLines(lines);
    if (normalized.length === 0) continue;

    const { data: uploadList } = await admin.storage.from("uploads").list(`${sub.subscriber_id}/training`, {
      limit: 100,
      offset: 0,
      sortBy: { column: "created_at", order: "desc" },
    });
    const samplePaths = (uploadList ?? [])
      .map((obj) => `${sub.subscriber_id}/training/${obj.name}`)
      .filter((path) => /\.(jpg|jpeg|png|webp|gif)$/i.test(path))
      .slice(0, 20);
    if (samplePaths.length < 10) continue;

    const create = await createCanonicalCustomerGenerationBatch(admin, {
      userId: sub.subscriber_id,
      rawLines: normalized,
      samplePaths,
      source: "monthly_scheduler",
      idempotencyKey: `monthly-cycle:${sub.subscriber_id}:${cycleStartIso.slice(0, 10)}`,
      cycleStartIso,
      cycleEndIso,
    });
    if (create.ok) queued.push(create.generationRequestId);
  }
  return queued;
}

