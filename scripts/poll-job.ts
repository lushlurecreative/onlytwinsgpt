#!/usr/bin/env npx tsx
/**
 * Poll a generation job until terminal state.
 * Usage: npx tsx scripts/poll-job.ts <job_id>
 */

import { readFileSync } from "fs";
import { resolve } from "path";

// Load .env.local
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

async function main() {
  const jobId = process.argv[2];
  if (!jobId) {
    console.error("Usage: npx tsx scripts/poll-job.ts <job_id>");
    process.exit(1);
  }

  const { getSupabaseAdmin } = await import("../lib/supabase-admin");
  const admin = getSupabaseAdmin();

  console.log(`\nPolling job ${jobId}...`);
  const t0 = Date.now();
  let lastStatus = "";

  for (let i = 0; i < 120; i++) {
    const { data: job } = await admin
      .from("generation_jobs")
      .select("id, status, output_path, runpod_job_id, failure_reason")
      .eq("id", jobId)
      .maybeSingle();

    if (!job) {
      console.error("Job not found");
      process.exit(1);
    }

    const status = job.status as string;
    if (status !== lastStatus) {
      const elapsed = Math.round((Date.now() - t0) / 1000);
      console.log(`[${elapsed}s] ${lastStatus || "start"} → ${status}`);
      lastStatus = status;
    }

    if (status === "completed") {
      const elapsed = Math.round((Date.now() - t0) / 1000);
      console.log(`\n=== COMPLETED in ${elapsed}s ===`);
      console.log(`Output: ${job.output_path}`);

      // Check storage
      if (job.output_path) {
        const { data: signedUrl } = await admin.storage
          .from("uploads")
          .createSignedUrl(job.output_path as string, 300);
        console.log(`Signed URL: ${signedUrl?.signedUrl ?? "FAILED"}`);
      }

      // Check post
      const { data: post } = await admin
        .from("posts")
        .select("id, storage_path")
        .eq("generation_job_id", jobId)
        .maybeSingle();
      console.log(`Post: ${post ? "YES (" + post.id + ")" : "NOT YET"}`);

      // Check generation_output
      const { data: output } = await admin
        .from("generation_outputs")
        .select("id, storage_path")
        .eq("generation_job_id", jobId)
        .maybeSingle();
      console.log(`Output record: ${output ? "YES (" + output.id + ")" : "NOT YET"}`);

      // Check job_events
      const { data: events } = await admin
        .from("job_events")
        .select("event, message, created_at")
        .eq("job_id", jobId)
        .order("created_at", { ascending: true });
      console.log(`Events: ${(events ?? []).length}`);
      for (const e of events ?? []) {
        console.log(`  ${e.event}: ${e.message}`);
      }

      process.exit(0);
    }

    if (status === "failed") {
      const elapsed = Math.round((Date.now() - t0) / 1000);
      console.log(`\n=== FAILED after ${elapsed}s ===`);
      console.log(`Reason: ${job.failure_reason}`);

      // Check job_events for diagnostics
      const { data: events } = await admin
        .from("job_events")
        .select("event, message, meta_json, created_at")
        .eq("job_id", jobId)
        .order("created_at", { ascending: true });
      console.log(`Events:`);
      for (const e of events ?? []) {
        console.log(`  ${e.event}: ${e.message}`);
      }

      // Also check RunPod status directly
      const runpodId = job.runpod_job_id as string;
      if (runpodId) {
        const apiKey = process.env.RUNPOD_API_KEY?.trim();
        const endpointId = process.env.RUNPOD_ENDPOINT_ID?.trim();
        if (apiKey && endpointId) {
          try {
            const res = await fetch(`https://api.runpod.ai/v2/${endpointId}/status/${runpodId}`, {
              headers: { Authorization: `Bearer ${apiKey}` },
            });
            const data = await res.json();
            console.log(`\nRunPod status:`, JSON.stringify(data, null, 2));
          } catch (e) {
            console.log("RunPod status check failed:", e);
          }
        }
      }

      process.exit(1);
    }

    await new Promise(r => setTimeout(r, 5000));
  }

  console.log("Timeout after 10 minutes");
  process.exit(1);
}

main().catch(e => { console.error(e); process.exit(1); });
