# Current Known Issues

Active bugs, race conditions, and architectural gaps. Do not ship new features that touch these areas without resolving or explicitly accounting for the issue.

Last updated: 2026-03-17

---

## 1. Plan key resolution — entitlements break when price ID env vars are not set

**Severity:** High — breaks entitlements for all new customers if env vars are missing

**Status: FIXED in `app/api/me/entitlements` route. Remaining gap: webhook revenue_events logging.**

**What was happening:**
- `lib/plan-entitlements.ts` → `getPlanKeyForStripePriceId(priceId)` only checked env vars
- If `STRIPE_PRICE_ID_*` env vars were not set, returned null → vault broken, revenue events wrong

**What was fixed:**
- Added `loadPriceIdPlanMap()` to `lib/plan-entitlements.ts` — loads from env vars, falls back to `app_settings` table
- Updated `app/api/me/entitlements/route.ts` to use `loadPriceIdPlanMap()` — entitlements now resolve from either source
- Note: `lib/usage-limits.ts` already had this fallback independently

**Remaining gap:**
- `app/api/billing/webhook/route.ts` line 411 still uses `getPlanKeyForStripePriceId()` (sync, env-only) for `revenue_events` logging. If env vars not set, `amountCents = 0` in revenue_events. Not customer-facing but data integrity issue.

**Resolution:** Set `STRIPE_PRICE_ID_*` env vars in Vercel. This is still the cleanest fix and eliminates all gaps at once.

**Files:** `lib/plan-entitlements.ts`, `app/api/me/entitlements/route.ts`, `app/api/billing/webhook/route.ts`

---

## 2. Thank-you race condition — auth UI shown before account is ready

**Severity:** High — customers see errors or cannot log in immediately after checkout

**Status: FIXED. `/api/thank-you/session` now checks profile row before returning `state: "ready"`.**

**What was happening:**
- `/api/thank-you/session` returned `state: "ready"` as soon as Stripe confirmed payment
- The webhook that creates the Supabase user and profile had not necessarily fired yet
- Customer sent to login with no account

**What was fixed:**
- `app/api/thank-you/session/route.ts` now queries `profiles` table for `stripe_customer_id` match before returning `state: "ready"`
- If profile row not found yet: returns `state: "processing"`, `reason: "auth_user_not_ready"` — page continues polling
- When webhook fires and creates the profile row, the next poll returns `state: "ready"`

**Remaining risk:**
- If Stripe webhook delivery is delayed (Stripe can retry for up to 72h), user is stuck polling indefinitely
- No timeout or fallback recovery flow for stuck users — manual support required

**Files:** `app/thank-you/page.tsx`, `app/api/thank-you/session/route.ts`, `app/api/billing/webhook/route.ts`

---

## 3. Vault role elevation can be blocked by RLS

**Severity:** Medium — customers with active subscription may be redirected to onboarding on repeat visits

**What happens:**
- `app/vault/page.tsx` detects a subscriber with `role != "creator"` and calls `setUserRole(supabase, user.id, "creator")`
- This uses the user-scoped Supabase client (anon key + cookies)
- If RLS on `profiles` does not allow users to update their own `role` column, the UPDATE fails silently
- Page continues in memory with `role = "creator"` (one-time success), but DB not updated
- On next page load: still `role != "creator"` → redirect to `/onboarding/creator` again

**Fix needed:**
Use `getSupabaseAdmin()` (service role) for role elevation, not user-scoped client. This bypasses RLS and guarantees the update persists.

**Files:** `app/vault/page.tsx`, `lib/roles.ts`

---

## 4. Lead conversion double-write

**Severity:** Low — data integrity issue, not customer-facing

**What happens:**
When `lead_id` is present in Stripe checkout metadata, lead conversion runs twice:
1. In `checkout.session.completed`: calls `convert_lead_to_customer()` RPC → sets lead status to `converted`, inserts one `automation_events` row
2. In `customer.subscription.created`: directly updates lead status to `converted` and inserts another `automation_events` row

Result: duplicate `automation_events` rows for the same lead conversion event.

**Fix needed:**
Remove the lead status update from the `customer.subscription.created` handler, or add an idempotency check.

**File:** `app/api/billing/webhook/route.ts`

---

## 5. Workspace creation is split across two webhook events

**Severity:** Medium — dashboard/vault can load between events with no subscription row

**What happens:**
- `checkout.session.completed` → creates profile (with `stripe_customer_id`, `role = "creator"`)
- `customer.subscription.created` → creates subscriptions row (resolved via `profiles.stripe_customer_id`)
- These are separate events, potentially seconds apart
- If user authenticates and hits `/dashboard` between these two events, `subscriptions` row doesn't exist yet
- Entitlement checks fail → user redirected to pricing or sees "no active plan"

**Current mitigation:**
- Thank-you polling waits for state=ready (checks auth user exists)
- Does not wait for subscription row

**Fix needed:**
Either (A) add subscription row existence check to thank-you readiness API, or (B) add retry/tolerance in entitlement checks for users with `onboarding_pending = true`.

**File:** `app/api/thank-you/session/route.ts`, `app/api/billing/webhook/route.ts`

---

## 6. `onboarding_pending` is never cleared

**Severity:** Low — `onboarding_pending = true` is set by webhook but lifecycle clearing is not fully verified

**What happens:**
- Webhook sets `profiles.onboarding_pending = true` on account creation
- `POST /api/thank-you/complete` exists to mark onboarding complete but does not explicitly set `onboarding_pending = false`
- Downstream: if any route gates on `onboarding_pending`, customers may be stuck

**Fix needed:**
Verify `/api/thank-you/complete` sets `onboarding_pending = false` and test the lifecycle.

**File:** `app/api/thank-you/complete/route.ts`

---

## 7. `presets` table may not exist in production

**Severity:** High if missing — generation fails with "relation public.presets does not exist"

**What happens:**
- `generation_jobs` references `presets.id` via FK
- `lib/generation-jobs.ts` → `getPresetIdBySceneKey()` queries `presets` table
- If the `presets` table was never created, all generation jobs fail

**Fix:**
Run the SQL block from `REMAINING_STEPS_FOR_USER.md` Section 6 in Supabase SQL Editor. This creates `subjects`, `presets`, `subjects_models`, `training_jobs`, `generation_jobs` if missing and seeds 9 preset rows.

---

## 8. `GENERATION_ENGINE_ENABLED` must be explicitly set to `"true"`

**Severity:** Medium — generation silently returns 503 if not set

**What happens:**
- `lib/generation-engine.ts` → `isGenerationEngineEnabled()` checks `process.env.GENERATION_ENGINE_ENABLED === "true"`
- Default is effectively disabled
- All generation entry points return 503 without this flag

**Fix:** Set `GENERATION_ENGINE_ENABLED=true` in Vercel Production environment variables.

---

## 9. Worker requires RunPod env vars before any generation can run

**Severity:** High for production generation

**What happens:**
- `lib/runpod.ts` requires `RUNPOD_API_KEY` and `RUNPOD_ENDPOINT_ID`
- Without these, job dispatch fails
- Worker health checks fail, admin worker panel shows degraded state

**Fix:** Set `RUNPOD_API_KEY` and `RUNPOD_ENDPOINT_ID` in Vercel. See `docs/env-vars.md`.

---

## 10. Bitcoin checkout has no webhook handler — payments not auto-provisioned

**Severity:** High if bitcoin payments are being accepted

**What happens:**
- `app/api/billing/bitcoin/checkout/route.ts` creates a Coinbase Commerce charge
- Customer pays on Coinbase-hosted page
- Coinbase sends a webhook to confirm payment, but **no handler exists** at any `/api/webhooks/coinbase` or similar route
- Payment is never confirmed programmatically — customer is never provisioned

**Consequence:**
- Customer pays but no Supabase user is created, no subscription row, no access
- Admin must manually provision them

**Fix needed:**
Create `app/api/webhooks/coinbase/route.ts` that:
1. Verifies Coinbase webhook signature (using `COINBASE_COMMERCE_WEBHOOK_SECRET`)
2. Handles `charge:confirmed` event
3. Creates Supabase user, upserts profile, upserts subscription — same pattern as `checkout.session.completed` in Stripe webhook handler

**Files:** `app/api/billing/bitcoin/checkout/route.ts`
