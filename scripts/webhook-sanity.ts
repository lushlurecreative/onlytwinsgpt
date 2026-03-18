#!/usr/bin/env tsx
/**
 * webhook-sanity.ts
 * Operational sanity check for webhook reliability and revenue integrity.
 *
 * Checks:
 *   1. Stuck webhook events — processed_at IS NULL and received more than 10 min ago
 *      (outer catch in W1 fix should mark these; remaining nulls = delivery/crash gaps)
 *   2. Zero-amount revenue events — amount_cents = 0 (price ID unknown at time of webhook)
 *   3. Summary of last 24h — events received, events processed, events stuck
 *
 * Run: npm run webhook-sanity
 * Requires: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY env vars.
 */

import { createClient } from "@supabase/supabase-js";
import { loadEnvLocal } from "./load-env.js";

loadEnvLocal();

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  console.error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.");
  process.exit(1);
}

const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

let issues = 0;

function ok(label: string, detail?: string) {
  console.log(`  ✓  ${label}${detail ? `  (${detail})` : ""}`);
}

function warn(label: string, detail?: string) {
  console.warn(`  ⚠  ${label}${detail ? `\n     ${detail}` : ""}`);
  issues++;
}

function fail(label: string, detail?: string) {
  console.error(`  ✗  ${label}${detail ? `\n     ${detail}` : ""}`);
  issues++;
}

function section(title: string) {
  console.log(`\n── ${title}`);
}

type WebhookRow = { stripe_event_id: string; event_type: string; received_at: string };
type RevenueRow = { id: string; amount_cents: number; stripe_event_id: string | null; plan_key: string | null; created_at: string };
type WebhookCount = { count: string };

async function main() {
  // ── 1. Stuck webhook events ──────────────────────────────────────────────────
  section("Stuck webhook events (processed_at IS NULL, received > 10 min ago)");

  const stuckCutoff = new Date(Date.now() - 10 * 60 * 1000).toISOString();

  const { data: stuckRows, error: stuckError } = await admin
    .from("stripe_webhook_events")
    .select("stripe_event_id, event_type, received_at")
    .is("processed_at", null)
    .lt("received_at", stuckCutoff)
    .order("received_at", { ascending: false })
    .limit(20);

  if (stuckError) {
    fail("Query failed", stuckError.message);
  } else {
    const rows = (stuckRows ?? []) as WebhookRow[];
    if (rows.length === 0) {
      ok("No stuck webhook events");
    } else {
      for (const row of rows) {
        warn(
          `Stuck event: ${row.event_type}`,
          `id=${row.stripe_event_id}  received=${row.received_at}`
        );
      }
    }
  }

  // ── 2. Zero-amount revenue events (last 30 days) ─────────────────────────────
  section("Zero-amount revenue events (last 30 days)");

  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const { data: zeroRows, error: zeroError } = await admin
    .from("revenue_events")
    .select("id, amount_cents, stripe_event_id, plan_key, created_at")
    .eq("amount_cents", 0)
    .gte("created_at", thirtyDaysAgo)
    .order("created_at", { ascending: false })
    .limit(20);

  if (zeroError) {
    fail("Query failed", zeroError.message);
  } else {
    const rows = (zeroRows ?? []) as RevenueRow[];
    if (rows.length === 0) {
      ok("No zero-amount revenue events");
    } else {
      for (const row of rows) {
        warn(
          `$0 revenue event`,
          `plan=${row.plan_key ?? "unknown"}  stripe_event=${row.stripe_event_id ?? "null"}  created=${row.created_at}`
        );
      }
    }
  }

  // ── 3. Last 24h summary ──────────────────────────────────────────────────────
  section("Webhook activity — last 24h");

  const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const { count: totalCount, error: totalError } = await admin
    .from("stripe_webhook_events")
    .select("*", { count: "exact", head: true })
    .gte("received_at", twentyFourHoursAgo);

  const { count: processedCount, error: processedError } = await admin
    .from("stripe_webhook_events")
    .select("*", { count: "exact", head: true })
    .gte("received_at", twentyFourHoursAgo)
    .not("processed_at", "is", null);

  if (totalError || processedError) {
    fail("Count query failed", (totalError ?? processedError)?.message);
  } else {
    const total = totalCount ?? 0;
    const processed = processedCount ?? 0;
    const stuck24h = total - processed;
    ok(`Received last 24h: ${total}`);
    ok(`Processed: ${processed}`);
    if (stuck24h > 0) {
      warn(`Unprocessed (still null): ${stuck24h}`);
    } else {
      ok(`Unprocessed: 0`);
    }
  }

  // ── Result ───────────────────────────────────────────────────────────────────
  console.log("");
  if (issues === 0) {
    console.log("Webhook sanity check passed — no issues found.");
    process.exit(0);
  } else {
    console.warn(`${issues} issue(s) found. Review warnings above.`);
    process.exit(1);
  }
}

main();
