#!/usr/bin/env npx tsx
/**
 * Standalone mock pipeline test script.
 * Tests the full generation pipeline lifecycle without GPU:
 *   1. Resolves subject + model + LoRA + preset for a user
 *   2. Creates a generation job
 *   3. Mock dispatcher simulates: dispatch → running → completed → upload → post + output creation
 *   4. Verifies all DB state transitions
 *
 * Usage: RUNPOD_MODE=mock npx tsx scripts/test-mock-pipeline.ts [user_id]
 *
 * Requires .env.local to be loaded (SUPABASE_SERVICE_ROLE_KEY, etc.)
 */

import { readFileSync } from "fs";
import { resolve } from "path";

// Load .env.local manually (no dotenv dependency)
const envPath = resolve(__dirname, "../.env.local");
const envContent = readFileSync(envPath, "utf-8");
for (const line of envContent.split("\n")) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) continue;
  const eqIdx = trimmed.indexOf("=");
  if (eqIdx < 0) continue;
  const key = trimmed.slice(0, eqIdx).trim();
  let value = trimmed.slice(eqIdx + 1).trim();
  // Strip surrounding quotes
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    value = value.slice(1, -1);
  }
  if (!process.env[key]) {
    process.env[key] = value;
  }
}

// Force mock mode
process.env.RUNPOD_MODE = "mock";

async function main() {
  // Dynamic imports after env is loaded
  const { getSupabaseAdmin } = await import("../lib/supabase-admin");
  const { getRunPodMode } = await import("../lib/runpod");
  const { createGenerationJob, getApprovedSubjectIdForUser, getLoraReferenceForSubject } = await import("../lib/generation-jobs");
  const { getActiveModelForUser } = await import("../lib/identity-models");
  const { getScenePresetByKey } = await import("../lib/scene-presets");

  const admin = getSupabaseAdmin();
  const mode = getRunPodMode();
  console.log(`\n=== OnlyTwins Mock Pipeline Test ===`);
  console.log(`Mode: ${mode}`);
  console.log(`Time: ${new Date().toISOString()}\n`);

  if (mode !== "mock") {
    console.error("ERROR: RUNPOD_MODE must be 'mock' for this test. Set RUNPOD_MODE=mock");
    process.exit(1);
  }

  // Resolve user
  const targetUserId = process.argv[2] || null;
  let userId: string;

  if (targetUserId) {
    userId = targetUserId;
    console.log(`Target user (from arg): ${userId}`);
  } else {
    // Find a user with an approved subject
    const { data: subjects } = await admin
      .from("subjects")
      .select("user_id")
      .eq("consent_status", "approved")
      .limit(1)
      .maybeSingle();
    if (!subjects?.user_id) {
      console.error("ERROR: No user with approved subject found. Pass user_id as argument.");
      process.exit(1);
    }
    userId = subjects.user_id as string;
    console.log(`Target user (auto-resolved): ${userId}`);
  }

  // Step 1: Resolve subject
  console.log("\n--- Step 1: Resolve Subject ---");
  const subjectId = await getApprovedSubjectIdForUser(userId);
  console.log(`Subject ID: ${subjectId ?? "NOT_FOUND"}`);
  if (!subjectId) {
    console.error("FAIL: No approved subject for user");
    process.exit(1);
  }

  // Step 2: Resolve active model + LoRA
  console.log("\n--- Step 2: Resolve Active Model ---");
  const activeModel = await getActiveModelForUser(userId);
  if (activeModel) {
    console.log(`Model ID: ${activeModel.id}`);
    console.log(`Version: ${activeModel.version}`);
    console.log(`Status: ${activeModel.status}`);
    console.log(`Model Path: ${activeModel.model_path ?? "null"}`);
    console.log(`Adapter Path: ${activeModel.adapter_path ?? "null"}`);
  } else {
    console.log("No active model found (will proceed without LoRA)");
  }

  const loraRef = await getLoraReferenceForSubject(subjectId);
  console.log(`LoRA Reference: ${loraRef ?? "NOT_FOUND"}`);

  // Step 3: Resolve preset
  console.log("\n--- Step 3: Resolve Preset ---");
  const preset = getScenePresetByKey("beach");
  console.log(`Preset: beach → ${preset?.label}`);

  const { data: presetRow } = await admin
    .from("presets")
    .select("id")
    .ilike("name", preset!.label)
    .limit(1)
    .maybeSingle();
  const presetId = presetRow?.id as string | null;
  console.log(`DB Preset ID: ${presetId ?? "NOT_FOUND"}`);
  if (!presetId) {
    console.error("FAIL: Preset 'Beach' not found in presets table");
    process.exit(1);
  }

  // Step 4: Resolve reference image
  console.log("\n--- Step 4: Resolve Reference Image ---");
  const { data: uploadList } = await admin.storage.from("uploads").list(`${userId}/training`, {
    limit: 1,
    offset: 0,
    sortBy: { column: "created_at", order: "desc" },
  });
  const refImage = (uploadList ?? []).find((obj) => /\.(jpg|jpeg|png|webp)$/i.test(obj.name));
  const refPath = refImage ? `${userId}/training/${refImage.name}` : null;
  console.log(`Reference Image: ${refPath ?? "NOT_FOUND"}`);
  if (!refPath) {
    console.error("FAIL: No training images found");
    process.exit(1);
  }

  // Step 5: Create generation job (triggers mock dispatch)
  console.log("\n--- Step 5: Create Generation Job (Mock Dispatch) ---");
  const t0 = Date.now();
  const jobId = await createGenerationJob({
    subject_id: subjectId,
    preset_id: presetId,
    reference_image_path: refPath,
    lora_model_reference: loraRef,
    generation_request_id: null,
    job_type: "user",
  });
  console.log(`Job ID: ${jobId ?? "FAILED"}`);
  if (!jobId) {
    console.error("FAIL: createGenerationJob returned null");
    process.exit(1);
  }

  // Step 6: Wait for mock callback to complete
  console.log("\n--- Step 6: Wait for Mock Callback ---");
  let finalStatus = "unknown";
  let outputPath: string | null = null;
  for (let i = 0; i < 20; i++) {
    await new Promise((r) => setTimeout(r, 500));
    const { data: jobRow } = await admin
      .from("generation_jobs")
      .select("id, status, output_path, runpod_job_id")
      .eq("id", jobId)
      .maybeSingle();
    const status = jobRow?.status as string;
    if (status !== finalStatus) {
      console.log(`  Job status: ${finalStatus} → ${status} (${Date.now() - t0}ms)`);
      finalStatus = status;
    }
    if (status === "completed" || status === "failed") {
      outputPath = (jobRow?.output_path as string) ?? null;
      break;
    }
  }

  const elapsed = Date.now() - t0;
  console.log(`\nFinal status: ${finalStatus} (${elapsed}ms)`);
  console.log(`Output path: ${outputPath ?? "null"}`);

  // Step 7: Verify DB state
  console.log("\n--- Step 7: Verify DB State ---");

  // Check generation_jobs
  const { data: finalJob } = await admin
    .from("generation_jobs")
    .select("id, status, output_path, runpod_job_id, failure_reason")
    .eq("id", jobId)
    .maybeSingle();
  console.log("generation_jobs:", JSON.stringify(finalJob, null, 2));

  // Check posts
  if (outputPath) {
    const { data: post } = await admin
      .from("posts")
      .select("id, storage_path, generation_job_id, created_at")
      .eq("generation_job_id", jobId)
      .maybeSingle();
    console.log("posts:", post ? JSON.stringify(post, null, 2) : "NOT_FOUND");
  }

  // Check generation_outputs
  const { data: genOutput } = await admin
    .from("generation_outputs")
    .select("id, storage_path, output_type, generation_job_id, created_at")
    .eq("generation_job_id", jobId)
    .maybeSingle();
  console.log("generation_outputs:", genOutput ? JSON.stringify(genOutput, null, 2) : "NOT_FOUND");

  // Check job_events
  const { data: events } = await admin
    .from("job_events")
    .select("event, message, created_at")
    .eq("job_id", jobId)
    .order("created_at", { ascending: true });
  console.log("job_events:", JSON.stringify(events, null, 2));

  // Check storage
  if (outputPath) {
    const { data: signedUrl } = await admin.storage
      .from("uploads")
      .createSignedUrl(outputPath, 60);
    console.log(`Storage signed URL: ${signedUrl?.signedUrl ? "OK" : "FAILED"}`);
  }

  // Summary
  console.log("\n=== RESULTS ===");
  const checks = [
    { name: "Job created", pass: !!jobId },
    { name: "Job completed", pass: finalStatus === "completed" },
    { name: "Output path set", pass: !!outputPath },
    { name: "Post created", pass: false },
    { name: "Generation output created", pass: !!genOutput },
    { name: "Job events logged", pass: (events?.length ?? 0) >= 2 },
  ];

  // Recheck post
  if (outputPath) {
    const { data: postCheck } = await admin
      .from("posts")
      .select("id")
      .eq("generation_job_id", jobId)
      .maybeSingle();
    checks[3].pass = !!postCheck;
  }

  for (const c of checks) {
    console.log(`  ${c.pass ? "PASS" : "FAIL"}: ${c.name}`);
  }

  const allPass = checks.every((c) => c.pass);
  console.log(`\n${allPass ? "ALL CHECKS PASSED" : "SOME CHECKS FAILED"} (${elapsed}ms)\n`);

  process.exit(allPass ? 0 : 1);
}

main().catch((e) => {
  console.error("Fatal error:", e);
  process.exit(1);
});
