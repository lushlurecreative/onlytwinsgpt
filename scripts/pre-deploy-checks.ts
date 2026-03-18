#!/usr/bin/env tsx
/**
 * pre-deploy-checks.ts
 * Run before every deploy: tsx scripts/pre-deploy-checks.ts
 * Exits 1 if any check fails.
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync, readdirSync, statSync } from "fs";
import { join } from "path";

const REPO_ROOT = new URL("..", import.meta.url).pathname;
let failures = 0;

function pass(label: string) {
  console.log(`  ✓  ${label}`);
}

function fail(label: string, detail?: string) {
  console.error(`  ✗  ${label}${detail ? `\n     ${detail}` : ""}`);
  failures++;
}

function section(title: string) {
  console.log(`\n── ${title}`);
}

// ── 1. No banned debug strings in source ────────────────────────────────────
section("Debug string check");

const BANNED = ["start-gating-debug", "start-gating-debug-reconcile"];
const SCAN_DIRS = ["app", "lib", "scripts"].map((d) => join(REPO_ROOT, d));

function scanDir(dir: string, banned: string[]): string[] {
  const hits: string[] = [];
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return hits;
  }
  for (const entry of entries) {
    const full = join(dir, entry);
    if (entry === "node_modules" || entry.startsWith(".")) continue;
    const stat = statSync(full);
    if (stat.isDirectory()) {
      hits.push(...scanDir(full, banned));
    } else if (full.endsWith(".ts") || full.endsWith(".tsx")) {
      const src = readFileSync(full, "utf8");
      for (const pattern of banned) {
        if (src.includes(pattern)) {
          hits.push(`${full.replace(REPO_ROOT, "")} contains "${pattern}"`);
        }
      }
    }
  }
  return hits;
}

const debugHits = SCAN_DIRS.flatMap((d) => scanDir(d, BANNED));
if (debugHits.length === 0) {
  pass("No banned debug strings found");
} else {
  for (const h of debugHits) fail("Debug string still present", h);
}

// ── 2. Required env vars present ────────────────────────────────────────────
section("Required env vars");

const REQUIRED_ENV = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET",
  "STRIPE_PRICE_ID_STARTER",
  "STRIPE_PRICE_ID_PROFESSIONAL",
  "STRIPE_PRICE_ID_ELITE",
  "STRIPE_PRICE_ID_SINGLE_BATCH",
  "STRIPE_PRICE_ID_PARTNER_70_30",
  "STRIPE_PRICE_ID_PARTNER_50_50",
  "SERVICE_CREATOR_ID",
  "ADMIN_OWNER_EMAILS",
  "CRON_SECRET",
  "WORKER_SECRET",
];

for (const key of REQUIRED_ENV) {
  if (process.env[key]?.trim()) {
    pass(key);
  } else {
    fail(key, "not set or empty");
  }
}

// ── 3. Schema: system_events table columns ──────────────────────────────────
section("Schema check — system_events");

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  fail("Cannot check schema — NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY missing");
} else {
  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

  // Query information_schema directly via raw SQL via rpc or via a table query.
  // Use a select on information_schema.columns — works with Supabase postgres.
  const { data, error } = await admin
    .from("system_events")
    .select("event_type, payload")
    .limit(0);

  if (error) {
    fail("system_events table query failed", error.message);
  } else {
    pass("system_events.event_type exists and is selectable");
    pass("system_events.payload exists and is selectable");
  }

  // Check stripe_webhook_events too (W1 depends on it).
  const { error: weError } = await admin
    .from("stripe_webhook_events")
    .select("stripe_event_id, processed_at")
    .limit(0);

  if (weError) {
    fail("stripe_webhook_events table query failed", weError.message);
  } else {
    pass("stripe_webhook_events.stripe_event_id + processed_at exist");
  }
}

// ── Result ───────────────────────────────────────────────────────────────────
console.log("");
if (failures === 0) {
  console.log("All pre-deploy checks passed.");
  process.exit(0);
} else {
  console.error(`${failures} check(s) failed. Fix before deploying.`);
  process.exit(1);
}
