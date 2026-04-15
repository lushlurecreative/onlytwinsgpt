#!/usr/bin/env npx tsx
/**
 * Dispatch exactly ONE real generation job to RunPod.
 * Usage: RUNPOD_MODE=production npx tsx scripts/dispatch-one-job.ts
 */

import { readFileSync } from "fs";
import { resolve } from "path";

// Load .env.local manually
const envPath = resolve(__dirname, "../.env.local");
const envContent = readFileSync(envPath, "utf-8");
for (const line of envContent.split("\n")) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) continue;
  const eqIdx = trimmed.indexOf("=");
  if (eqIdx < 0) continue;
  const key = trimmed.slice(0, eqIdx).trim();
  let value = trimmed.slice(eqIdx + 1).trim();
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    value = value.slice(1, -1);
  }
  if (!process.env[key]) process.env[key] = value;
}

// Force production mode for real GPU dispatch
process.env.RUNPOD_MODE = "production";

async function main() {
  const { getSupabaseAdmin } = await import("../lib/supabase-admin");
  const { getRunPodMode } = await import("../lib/runpod");
  const { createGenerationJob, getApprovedSubjectIdForUser, getLoraReferenceForSubject } = await import("../lib/generation-jobs");
  const { getActiveModelForUser } = await import("../lib/identity-models");
  const { getScenePresetByKey } = await import("../lib/scene-presets");

  const admin = getSupabaseAdmin();
  const mode = getRunPodMode();
  console.log(`\n=== Dispatch ONE Real Job ===`);
  console.log(`Mode: ${mode}`);

  if (mode !== "production") {
    console.error("ERROR: RUNPOD_MODE must be 'production'. Got:", mode);
    process.exit(1);
  }

  // Resolve user
  const { data: subjects } = await admin.from("subjects").select("user_id").eq("consent_status", "approved").limit(1).maybeSingle();
  const userId = subjects?.user_id as string;
  console.log(`User: ${userId}`);

  const subjectId = await getApprovedSubjectIdForUser(userId);
  console.log(`Subject: ${subjectId}`);

  const activeModel = await getActiveModelForUser(userId);
  console.log(`Model: ${activeModel?.id} v${activeModel?.version} path=${activeModel?.model_path}`);

  const loraRef = await getLoraReferenceForSubject(subjectId!);
  console.log(`LoRA: ${loraRef}`);

  const preset = getScenePresetByKey("beach");
  const { data: presetRow } = await admin.from("presets").select("id").ilike("name", preset!.label).limit(1).maybeSingle();
  console.log(`Preset: ${presetRow?.id}`);

  const { data: uploadList } = await admin.storage.from("uploads").list(`${userId}/training`, { limit: 1, offset: 0, sortBy: { column: "created_at", order: "desc" } });
  const refImage = (uploadList ?? []).find((obj: { name: string }) => /\.(jpg|jpeg|png|webp)$/i.test(obj.name));
  const refPath = refImage ? `${userId}/training/${refImage.name}` : null;
  console.log(`Ref image: ${refPath}`);

  if (!subjectId || !presetRow?.id || !refPath) {
    console.error("FAIL: Missing prerequisites");
    process.exit(1);
  }

  console.log(`\n>>> DISPATCHING TO RUNPOD <<<`);
  const jobId = await createGenerationJob({
    subject_id: subjectId,
    preset_id: presetRow.id as string,
    reference_image_path: refPath,
    lora_model_reference: loraRef,
    generation_request_id: null,
    job_type: "user",
  });
  console.log(`Job ID: ${jobId}`);

  if (!jobId) {
    console.error("FAIL: createGenerationJob returned null");
    process.exit(1);
  }

  // Read back
  const { data: jobRow } = await admin.from("generation_jobs").select("id, status, runpod_job_id").eq("id", jobId).maybeSingle();
  console.log(`Status: ${jobRow?.status}`);
  console.log(`RunPod Job ID: ${jobRow?.runpod_job_id}`);
  console.log(`\nJob dispatched. Poll with: npx tsx scripts/poll-job.ts ${jobId}`);

  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
