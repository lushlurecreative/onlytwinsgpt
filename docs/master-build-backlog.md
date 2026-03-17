# Master Build Backlog

Single source of truth for what is left to build, fix, and verify. Read this before starting any new task.

Last updated: 2026-03-17

---

## Current production state summary

The platform is built and deployed. Core architecture is complete:
- Auth (Supabase, email + Google OAuth) ✅
- Guest checkout → webhook provisioning → account creation ✅
- Admin shell (leads, customers, revenue) ✅
- Generation pipeline (generation_requests → RunPod → vault) ✅
- Lead automation (scrape → sample → outreach → convert) ✅
- Billing (Stripe subscriptions, webhook idempotency, entitlements) ✅

**We are in Phase A (Revenue Reliability).** The infrastructure exists but has not been fully verified in production. No new features until Phase A is confirmed complete.

---

## What is working

- Auth login/logout, Google OAuth, email/password
- Admin routing (proxy.ts + admin layout double-check)
- Stripe checkout session creation (plan and creator-subscription modes)
- Webhook idempotency (`stripe_webhook_events` insert-first lock)
- `checkout.session.completed` → auth user creation, profile upsert
- `customer.subscription.created` → subscriptions row creation
- Admin customers list and detail pages
- Admin leads list and outreach
- Admin payment links (create Stripe checkout link for specific email + plan)
- Generation pipeline (generation_requests, generation_request_lines, recurring_request_mixes)
- Monthly scheduler + cron-based batch dispatch
- RunPod job dispatch and completion webhook
- Training jobs tracking
- Watermark logs
- Usage ledger and enforcement
- Audit log
- Revenue events tracking

---

## What is partially working

### Entitlements (plan key resolution)
**Status:** Works if `STRIPE_PRICE_ID_*` env vars are set in Vercel. Breaks if they are not.
**Root cause:** `getPlanKeyForStripePriceId()` only reads env vars; checkout stores prices in `app_settings`.
**Blocker:** Must set all 6 `STRIPE_PRICE_ID_*` env vars in Vercel **or** fix the resolver to fall back to `app_settings`.
**See:** `docs/current-known-issues.md` Issue #1

### Thank-you / onboarding flow
**Status:** Flow exists. Race condition is mitigated by polling but not fully eliminated.
**Blocker:** `onboarding_pending` lifecycle not verified. Vault role elevation may fail silently.
**See:** `docs/current-known-issues.md` Issues #2, #3, #6

### Generation engine
**Status:** Code complete. Not running in production until `GENERATION_ENGINE_ENABLED=true` and RunPod env vars set.
**Blocker:** Env vars must be set. Presets table must exist.
**See:** `docs/current-known-issues.md` Issues #7, #8, #9

---

## What is broken

### Known bugs requiring code fixes

| # | Issue | Severity | Fix required |
|---|---|---|---|
| 1 | Plan key resolution: entitlements null when price env vars missing | High | Fix `getPlanKeyForStripePriceId()` to fall back to `app_settings` OR set all STRIPE_PRICE_ID env vars |
| 2 | Vault role elevation uses user-scoped client, blocked by RLS | Medium | Switch to `getSupabaseAdmin()` for role update in `app/vault/page.tsx` |
| 3 | Lead conversion double-write (runs in both webhook events) | Low | Remove duplicate from `customer.subscription.created` handler |
| 4 | Workspace split: subscription row missing when user hits dashboard between webhook events | Medium | Add subscription row readiness check to thank-you session API |
| 5 | `onboarding_pending` never explicitly cleared | Low | Verify and fix `app/api/thank-you/complete/route.ts` |

---

## Exact remaining blockers for Phase A completion

These must be verified or fixed before Phase A is considered complete:

1. **Stripe end-to-end test** — Run one live guest checkout in production. Confirm:
   - Webhook `checkout.session.completed` returns 200 in Stripe dashboard
   - Webhook `customer.subscription.created` returns 200
   - `profiles` row created with `stripe_customer_id` set
   - `subscriptions` row created with `status = active`
   - User can log in after checkout and reach `/dashboard`

2. **Entitlements working** — After checkout, `GET /api/me/entitlements` returns real plan data (not "No plan found").
   - Requires `STRIPE_PRICE_ID_*` env vars OR code fix to resolver

3. **Vault accessible** — After checkout and login, user can reach `/vault` without being redirected to onboarding.
   - Requires role elevation fix (Issue #2)

4. **RunPod configured** — `RUNPOD_API_KEY` and `RUNPOD_ENDPOINT_ID` set in Vercel.
   - Required for generation to run at all

5. **Generation engine enabled** — `GENERATION_ENGINE_ENABLED=true` set in Vercel.

6. **Presets table exists** — Run the SQL block from `REMAINING_STEPS_FOR_USER.md` Section 6 if not already done.

---

## Next tasks in priority order

### P0 — Blockers (Phase A cannot be called complete without these)

1. ~~**Fix plan key resolution**~~ **FIXED** — `loadPriceIdPlanMap()` added to `lib/plan-entitlements.ts`. Falls back to `app_settings`. Entitlements route updated. Remaining gap: webhook revenue_events still uses env-only path — set `STRIPE_PRICE_ID_*` env vars to close fully.

2. ~~**Fix vault role elevation**~~ — Current `app/vault/page.tsx` does not attempt role elevation; it redirects if `role != "creator"`. The webhook sets `role: "creator"` on checkout. This is the correct behaviour. Issue as originally documented no longer applies to current code.

3. ~~**Fix thank-you race condition**~~ **FIXED** — `app/api/thank-you/session/route.ts` now checks `profiles.stripe_customer_id` before returning `state: "ready"`. Customer will not be sent to login until the webhook has provisioned their profile row.

4. **Verify Phase A end-to-end** — Run the full test sequence from `docs/testing-checklist.md` sections 1–7 against production.

5. **Set production env vars** — Confirm all required env vars from `docs/env-vars.md` are set in Vercel Production.

### P1 — Fix before Phase B

5. **Fix workspace split race** — Update `/api/thank-you/session` to check for subscription row existence in addition to auth user readiness.
   - File: `app/api/thank-you/session/route.ts`

6. **Clear onboarding_pending** — Verify `app/api/thank-you/complete/route.ts` sets `onboarding_pending = false` after successful completion.

7. **Remove duplicate lead conversion** — Remove the lead status update from `customer.subscription.created` handler, keeping only the RPC call in `checkout.session.completed`.
   - File: `app/api/billing/webhook/route.ts`

### P2 — Phase B (Entitlement hardening)

8. **Cancellation/expiry handling** — Verify customers with `canceled` or `expired` status cannot access vault or generate content.

9. **past_due grace period** — Confirm 3-day grace period logic in `lib/subscriptions.ts` is working and documented.

10. **Subscription health admin view** — `/admin/subscription-health` for catching sync gaps between Stripe and DB.

### P3 — Phase C (Creator ops UX)

11. **Dashboard summaries** — Customer `/dashboard` should show usage stats, plan details, next cycle date, and generation status.

12. **Creator billing indicators** — Show subscribers their active plan, renewal date, and generation quota without Stripe language.

13. **Request preferences UI** — `/requests` page for setting generation mix (photos/videos/prompts) is the core customer UX loop.

### P4 — Phase D (Consent-first onboarding)

14. **Full consent workflow** — `consent_records` table, identity verification gate, onboarding state machine.

15. **Onboarding state machine** — UI for `sourced → contacted → qualified → consented → onboarded → model_ready`.

### P5 — Phase G (Scale + monitoring)

16. **Centralized alerting** — Route `sendAlert()` calls to a real notification channel (email, Slack, or similar).

17. **Queue observability** — Admin view for stuck jobs, retry controls, job reaper verification.

18. **Abuse controls** — Rate limiting for generation requests, abuse detection.

---

## Billing section

**Working:**
- Stripe checkout session creation (plan and creator-subscription)
- Webhook idempotency (insert-first lock pattern)
- Profile provisioning on `checkout.session.completed`
- Subscription row provisioning on `customer.subscription.created`
- Revenue events logging
- Invoice payment failed handling (`past_due` status update)
- Admin payment links

**Broken/incomplete:**
- Plan key resolution from `stripe_price_id` → entitlements (Issue #1)
- Lead conversion double-write (Issue #3)
- Workspace split race (Issue #5)

**Do not touch billing without reading:**
`docs/stripe-billing.md`, `docs/current-known-issues.md`, `app/api/billing/webhook/route.ts`

---

## Auth section

**Working:**
- Login (email/password + Google OAuth)
- `proxy.ts` routing and admin redirect
- Admin layout double-check
- Auth callback (`/auth/callback/page.tsx`)
- Logout (`/logout`)
- Rate limiting on login page

**Incomplete:**
- `onboarding_pending` lifecycle not verified end-to-end

---

## Admin section

**Working:**
- Admin shell (layout, nav, routing separation)
- Customers list + detail
- Leads list + outreach
- Revenue metrics
- Payment links (create, copy, list)
- Worker config panel
- Webhook events log

**Not in primary nav (built but not linked from AdminNav):**
Subscriptions, cohorts, alerts, KPIs, churn, creator KPIs, webhook health, diagnostics, subjects, watermark, cost, generation-requests, automation, settings, creator profiles, user-reset

Consider: audit which of these are used regularly and surface them in the nav or in the customer detail page.

---

## Generation section

**Working (code):**
- Mix save flow (`PUT /api/me/request-preferences`)
- Batch creation (`createCanonicalCustomerGenerationBatch`)
- Monthly scheduler (`scheduleMonthlyCustomerBatches`)
- Job processor (`processPendingCustomerGeneration`)
- RunPod dispatch and completion webhook
- Training job tracking

**Blocked (not running in production):**
- `GENERATION_ENGINE_ENABLED` must be set to `"true"`
- `RUNPOD_API_KEY` and `RUNPOD_ENDPOINT_ID` must be configured
- `presets` table must exist (run SQL from `REMAINING_STEPS_FOR_USER.md`)

**Known gap:**
- Video generation lines are skipped in processor (line: `if (line.line_type !== 'photo') continue`)

---

## Dashboard / customer UX section

**Working:**
- `/dashboard` exists with basic content
- `/vault` exists with creator content
- `/requests` for generation preferences
- `/upload` for training photos

**Incomplete:**
- Dashboard summaries (plan info, usage, generation status) not fully built
- No clear indication to user of "where they are" in the onboarding journey

---

## Do not forget (recurring known issues)

1. Every time you touch `getPlanKeyForStripePriceId()` — test that entitlements return correct plan after a real checkout
2. Every time you touch `proxy.ts` — test that admin cannot see customer shell and vice versa
3. Every time you touch the webhook handler — test idempotency (replay same event, confirm no duplicate rows)
4. Every time you add a DB column — write a migration, never assume it exists
5. Every time you touch generation — confirm `GENERATION_ENGINE_ENABLED` gate is in place
6. Every time you push — run `docs/testing-checklist.md` sections relevant to what changed

---

## Manual test after each change

After any billing change:
- Run test: Stripe checkout end-to-end (see `docs/testing-checklist.md` section 3)
- Run test: Webhook idempotency replay (section 4)
- Check: entitlements endpoint returns correct plan

After any auth change:
- Run test: Admin login routing (section 1)
- Run test: Customer login (section 2)
- Run test: Logout clears session (section 9)

After any generation change:
- Run test: Mix save → batch creation → job dispatch (sections 5, 6)
- Check: `GENERATION_ENGINE_ENABLED` gate respected
- Check: idempotency key prevents duplicate batches

After any DB migration:
- Verify migration ran in Supabase (check table/column exists)
- Verify no RLS gaps introduced
- Deploy code after (never before) migration

---

## Phase progress tracker

| Phase | Status | Blocking items |
|---|---|---|
| A – Revenue Reliability | In progress | Issues #1, #2, #4; Phase A env var setup |
| B – Entitlement Hardening | Not started | Phase A must complete first |
| C – Creator Ops UX | Not started | — |
| D – Consent-First Onboarding | Not started | — |
| E – Training/Generation Pipeline | Code complete, not live | GENERATION_ENGINE_ENABLED, RunPod config |
| F – Lead Engine Automation | Code complete | Lead engine running, quality tuning ongoing |
| G – Scale + Monitoring | Not started | — |
