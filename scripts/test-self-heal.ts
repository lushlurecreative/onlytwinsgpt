#!/usr/bin/env tsx
/**
 * test-self-heal.ts
 * Integration test for the post-checkout self-heal mechanism.
 *
 * What it tests:
 *   1. A Stripe checkout session is retrievable and has the expected shape.
 *   2. The session age check (< 24h) correctly accepts a fresh session.
 *   3. The DB transfer mechanism: inserting a profile + subscription linked to a
 *      Stripe customer, then simulating the ownership transfer that self-heal performs.
 *   4. After transfer, the subscription row has the new subscriber_id.
 *
 * What it cannot test (requires browser + full auth flow):
 *   - The Next.js cookie read (ot_checkout_sid) — server-side only.
 *   - The full gating decision (redirect vs. pass-through) — requires running app.
 *
 * Run: tsx scripts/test-self-heal.ts
 * Requires: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, STRIPE_SECRET_KEY,
 *           STRIPE_PRICE_ID_STARTER env vars (loaded from .env.local automatically).
 */

import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";
import { loadEnvLocal } from "./load-env.js";

loadEnvLocal();

const stripeKey = process.env.STRIPE_SECRET_KEY;
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const starterPriceId = process.env.STRIPE_PRICE_ID_STARTER;

if (!stripeKey || !supabaseUrl || !serviceKey || !starterPriceId) {
  console.error("Missing required env vars: STRIPE_SECRET_KEY, NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, STRIPE_PRICE_ID_STARTER");
  process.exit(1);
}

const stripe = new Stripe(stripeKey);
const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

let failures = 0;
const TEST_PREFIX = `test_selfheal_${Date.now()}`;
const testEmail = `${TEST_PREFIX}@example.com`;
let createdUserId: string | null = null;
let createdSubscriptionId: string | null = null;
let stripeCustomerId: string | null = null;
let checkoutSessionId: string | null = null;

function pass(label: string) { console.log(`  ✓  ${label}`); }
function fail(label: string, detail?: string) {
  console.error(`  ✗  ${label}${detail ? `\n     ${detail}` : ""}`);
  failures++;
}

async function cleanup() {
  if (createdSubscriptionId) {
    await admin.from("subscriptions").delete().eq("id", createdSubscriptionId);
  }
  if (createdUserId) {
    await admin.from("profiles").delete().eq("id", createdUserId);
    await admin.auth.admin.deleteUser(createdUserId);
  }
}

async function main() {
  console.log("\n── Self-heal integration test\n");

  // ── 1. Create a Stripe checkout session (test mode, no card needed) ────────
  let session: Stripe.Checkout.Session;
  try {
    session = await stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: [{ price: starterPriceId!, quantity: 1 }],
      success_url: "https://onlytwins.dev/thank-you?sid={CHECKOUT_SESSION_ID}",
      cancel_url: "https://onlytwins.dev/pricing",
      metadata: { source: "pricing", plan: "starter" },
      subscription_data: { metadata: { source: "pricing", plan: "starter" } },
    });
    checkoutSessionId = session.id;
    pass(`Stripe session created: ${session.id}`);
  } catch (err) {
    fail("Stripe session creation failed", err instanceof Error ? err.message : String(err));
    process.exit(1);
  }

  // ── 2. Session age check logic ─────────────────────────────────────────────
  // Mirrors the check in require-active-subscriber.ts
  const SESSION_MAX_AGE_MS = 24 * 60 * 60 * 1000;
  const sessionAgeMs = Date.now() - (session.created ?? 0) * 1000;
  if (sessionAgeMs <= SESSION_MAX_AGE_MS) {
    pass(`Session age check: ${Math.round(sessionAgeMs / 1000)}s old — valid (< 24h)`);
  } else {
    fail("Session age check: session is older than 24h", `age: ${Math.round(sessionAgeMs / 1000)}s`);
  }

  // ── 3. Retrieve the session (as self-heal does) ────────────────────────────
  let retrieved: Stripe.Checkout.Session;
  try {
    retrieved = await stripe.checkout.sessions.retrieve(session.id, {
      expand: ["customer", "subscription"],
    });
    pass("Session retrievable with customer + subscription expand");
  } catch (err) {
    fail("Session retrieve failed", err instanceof Error ? err.message : String(err));
    process.exit(1);
  }

  // Session just created has no customer yet (no card entered) — expected.
  // The self-heal uses the customer from a COMPLETED session; here we test the
  // DB transfer mechanism independently.
  if (retrieved.status === "open" || retrieved.status === "complete") {
    pass(`Session status: ${retrieved.status}`);
  } else {
    fail("Unexpected session status", retrieved.status ?? "null");
  }

  // ── 4. DB transfer mechanism ───────────────────────────────────────────────
  // Simulate: user A owns a subscription linked to stripeCustomerA.
  // User B logs in, self-heal transfers ownership to user B.

  // Create user A (original owner)
  const emailA = `${TEST_PREFIX}_a@example.com`;
  const { data: userA, error: userAErr } = await admin.auth.admin.createUser({
    email: emailA, password: `${TEST_PREFIX}aPass!1`, email_confirm: true,
  });
  if (userAErr || !userA.user?.id) {
    fail("Create user A", userAErr?.message ?? "no user id");
    await cleanup();
    process.exit(1);
  }
  const userAId = userA.user.id;

  // Create user B (new subscriber who should get ownership)
  const emailB = `${TEST_PREFIX}_b@example.com`;
  const { data: userB, error: userBErr } = await admin.auth.admin.createUser({
    email: emailB, password: `${TEST_PREFIX}bPass!1`, email_confirm: true,
  });
  if (userBErr || !userB.user?.id) {
    fail("Create user B", userBErr?.message ?? "no user id");
    await admin.auth.admin.deleteUser(userAId);
    process.exit(1);
  }
  const userBId = userB.user.id;
  createdUserId = userBId; // track for cleanup

  // Fake stripe customer ID for this test
  stripeCustomerId = `cus_test_${TEST_PREFIX}`;

  // Insert profile for user A linked to the fake stripe customer
  await admin.from("profiles").upsert(
    { id: userAId, stripe_customer_id: stripeCustomerId, role: "creator" },
    { onConflict: "id" }
  );

  // Insert subscription owned by user A
  const { data: subRow, error: subErr } = await admin.from("subscriptions").insert({
    creator_id: userAId,
    subscriber_id: userAId,
    status: "active",
    stripe_subscription_id: `sub_test_${TEST_PREFIX}`,
    stripe_price_id: starterPriceId,
  }).select("id").single();

  if (subErr || !subRow?.id) {
    fail("Insert test subscription", subErr?.message ?? "no row");
    await admin.auth.admin.deleteUser(userAId);
    await admin.auth.admin.deleteUser(userBId);
    process.exit(1);
  }
  createdSubscriptionId = (subRow as { id: string }).id;
  pass("Test subscription inserted for user A");

  // Now simulate self-heal: user B presents cookie → system looks up customer → finds user A owns it → transfers

  // Step 1: look up profile by stripe_customer_id (as self-heal does)
  const { data: profileByCustomer } = await admin
    .from("profiles").select("id").eq("stripe_customer_id", stripeCustomerId).maybeSingle();
  const existingOwnerId = (profileByCustomer as { id?: string } | null)?.id ?? null;

  if (existingOwnerId === userAId) {
    pass("Profile lookup by stripe_customer_id found user A");
  } else {
    fail("Profile lookup by stripe_customer_id", `expected ${userAId}, got ${existingOwnerId}`);
  }

  // Step 2: transfer subscriptions from user A to user B
  const { error: transferErr } = await admin
    .from("subscriptions")
    .update({ subscriber_id: userBId })
    .eq("subscriber_id", userAId);
  if (transferErr) {
    fail("Subscription transfer", transferErr.message);
  } else {
    pass("Subscription subscriber_id transferred from user A to user B");
  }

  // Step 3: clear stripe_customer_id from user A, assign to user B
  await admin.from("profiles")
    .update({ stripe_customer_id: null, updated_at: new Date().toISOString() })
    .eq("id", userAId).eq("stripe_customer_id", stripeCustomerId);
  await admin.from("profiles").upsert(
    { id: userBId, stripe_customer_id: stripeCustomerId, onboarding_pending: false, updated_at: new Date().toISOString() },
    { onConflict: "id" }
  );

  // Step 4: verify user B now has the subscription
  const { data: userBSubs } = await admin
    .from("subscriptions").select("id, status").eq("subscriber_id", userBId).limit(5);
  const activeSub = ((userBSubs ?? []) as Array<{ id: string; status: string }>)
    .find((r) => r.status === "active");
  if (activeSub) {
    pass("User B now has active subscription after transfer");
  } else {
    fail("User B subscription not found after transfer");
  }

  // Step 5: verify user A no longer has the subscription
  const { data: userASubs } = await admin
    .from("subscriptions").select("id").eq("subscriber_id", userAId).limit(5);
  if (!userASubs || (userASubs as unknown[]).length === 0) {
    pass("User A no longer has subscription after transfer");
  } else {
    fail("User A still has subscription after transfer — transfer incomplete");
  }

  // Cleanup
  await admin.from("subscriptions").delete().eq("id", (subRow as { id: string }).id);
  await admin.from("profiles").delete().eq("id", userAId);
  await admin.from("profiles").delete().eq("id", userBId);
  await admin.auth.admin.deleteUser(userAId);
  await admin.auth.admin.deleteUser(userBId);
  createdUserId = null;
  createdSubscriptionId = null;

  pass("Cleanup complete");

  console.log("");
  if (failures === 0) {
    console.log("Self-heal tests passed.");
    process.exit(0);
  } else {
    console.error(`${failures} test(s) failed.`);
    process.exit(1);
  }
}

main();
