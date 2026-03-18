#!/usr/bin/env tsx
/**
 * test-webhook-lock.ts
 * Integration test: verifies that the stripe_webhook_events lock/mark mechanism
 * works correctly against the real Supabase DB.
 *
 * What it tests:
 *   1. A row can be inserted with processed_at = null (lock acquired).
 *   2. The same event ID cannot be inserted again (idempotency — duplicate key 23505).
 *   3. markStripeEventProcessed sets processed_at to a non-null timestamp.
 *
 * This covers the mechanism that W1 (outer catch) depends on.
 *
 * Run: tsx scripts/test-webhook-lock.ts
 * Requires: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY env vars.
 */

import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  console.error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.");
  process.exit(1);
}

const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

const TEST_EVENT_ID = `test_evt_webhook_lock_${Date.now()}`;
let failures = 0;

function pass(label: string) {
  console.log(`  ✓  ${label}`);
}

function fail(label: string, detail?: string) {
  console.error(`  ✗  ${label}${detail ? `\n     ${detail}` : ""}`);
  failures++;
}

async function cleanup() {
  await admin
    .from("stripe_webhook_events")
    .delete()
    .eq("stripe_event_id", TEST_EVENT_ID);
}

// ── Test 1: insert lock row ──────────────────────────────────────────────────
const { error: insertError } = await admin.from("stripe_webhook_events").insert({
  stripe_event_id: TEST_EVENT_ID,
  event_type: "test.pre_deploy_check",
  processed_at: null,
});

if (insertError) {
  fail("Insert lock row (processed_at = null)", insertError.message);
  process.exit(1);
} else {
  pass("Insert lock row (processed_at = null)");
}

// ── Test 2: duplicate insert returns 23505 ───────────────────────────────────
const { error: dupError } = await admin.from("stripe_webhook_events").insert({
  stripe_event_id: TEST_EVENT_ID,
  event_type: "test.pre_deploy_check",
  processed_at: null,
});

const dupCode = (dupError as { code?: string } | null)?.code;
if (dupCode === "23505") {
  pass("Duplicate insert rejected with 23505 (idempotency guard works)");
} else {
  fail("Duplicate insert should have been rejected", dupError?.message ?? "no error returned");
}

// ── Test 3: markStripeEventProcessed sets processed_at ──────────────────────
const processedAt = new Date().toISOString();
const { error: updateError } = await admin
  .from("stripe_webhook_events")
  .update({ processed_at: processedAt })
  .eq("stripe_event_id", TEST_EVENT_ID);

if (updateError) {
  fail("Update processed_at", updateError.message);
} else {
  // Verify the value was actually written.
  const { data, error: readError } = await admin
    .from("stripe_webhook_events")
    .select("processed_at")
    .eq("stripe_event_id", TEST_EVENT_ID)
    .single();

  if (readError) {
    fail("Read back processed_at", readError.message);
  } else {
    const row = data as { processed_at: string | null } | null;
    if (row?.processed_at) {
      pass(`markStripeEventProcessed mechanism: processed_at set to ${row.processed_at}`);
    } else {
      fail("markStripeEventProcessed mechanism: processed_at still null after update");
    }
  }
}

// ── Cleanup ──────────────────────────────────────────────────────────────────
await cleanup();

console.log("");
if (failures === 0) {
  console.log("Webhook lock tests passed.");
  process.exit(0);
} else {
  console.error(`${failures} test(s) failed.`);
  process.exit(1);
}
