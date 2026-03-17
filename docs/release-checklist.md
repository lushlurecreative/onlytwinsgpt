# Release Checklist

Use before any meaningful deploy. Sections are tagged by which type of change they apply to.

---

## Pre-deploy (always)

- [ ] TypeScript compiles with no errors (check Vercel build log)
- [ ] No `console.log` left in customer-facing paths
- [ ] No placeholder copy or dead UI elements added
- [ ] Affected docs in `/docs/` updated to match changes
- [ ] New env vars documented in `docs/env-vars.md` and added to Vercel before deploy

---

## If schema was changed

- [ ] Migration file created in `supabase/migrations/YYYYMMDDNNNN_description.sql`
- [ ] Migration is idempotent (`IF NOT EXISTS`, `IF EXISTS`, drop-before-recreate constraints)
- [ ] `GRANT` statements included for new tables
- [ ] RLS policies added for any table with user data
- [ ] Migration run in Supabase SQL Editor **before** pushing code
- [ ] Confirmed column/table exists in Supabase after running

---

## If billing code was changed

- [ ] Read `docs/stripe-billing.md` and `docs/current-known-issues.md` before making changes
- [ ] Webhook idempotency pattern preserved (`stripe_webhook_events` insert-first)
- [ ] `subscriptions` table still only written from `app/api/billing/webhook/route.ts`
- [ ] Stripe price ID env vars present for all 6 plans in Vercel (`STRIPE_PRICE_ID_*`)
- [ ] Run full checkout test: pricing → Stripe → thank-you → login → dashboard
- [ ] Confirm `checkout.session.completed` webhook returns 200 in Stripe dashboard
- [ ] Confirm `customer.subscription.created` webhook returns 200
- [ ] Confirm profile row created with `stripe_customer_id`
- [ ] Confirm subscriptions row created with `status = active`
- [ ] Confirm `/api/me/entitlements` returns correct plan (not "No plan found")

---

## If auth code was changed (`proxy.ts`, `lib/admin.ts`, `app/auth/callback`, `app/admin/layout.tsx`)

- [ ] Admin login → must land at `/admin`, never at `/dashboard`
- [ ] Admin accessing `/dashboard` → must redirect to `/admin`
- [ ] Customer accessing `/admin` → must redirect to `/dashboard?unauthorized=admin`
- [ ] Unauthenticated user accessing `/upload` or `/admin` → must redirect to `/login?redirectTo=...`
- [ ] Logout clears session; protected routes redirect after logout
- [ ] Security headers still applied (X-Frame-Options, HSTS, etc.)

---

## If generation code was changed

- [ ] `GENERATION_ENGINE_ENABLED=true` set in Vercel Production
- [ ] `GENERATION_ENGINE_DISABLED` gate still checked at all generation entry points
- [ ] Idempotency keys verified (format: `request-mix-save:{userId}:{cycleStart}`)
- [ ] Mix save respects plan allowance limits (does not exceed `includedImages`/`includedVideos`)
- [ ] Pending requests are picked up by processor cron
- [ ] Failed requests have `admin_notes` populated

---

## If new admin page or API was added

- [ ] Admin API route verifies admin status (not just session)
- [ ] Uses `getSupabaseAdmin()` for data access
- [ ] Logs action to `audit_log` if it modifies customer data
- [ ] New admin page listed in `docs/admin-routes.md`

---

## Phase A verification (run once before declaring Phase A complete)

Based on `RUNBOOK_PHASE1_VERIFICATION.md`:

### 1. Guest checkout end-to-end
- [ ] Open `/pricing` in incognito
- [ ] Start plan checkout as guest
- [ ] Complete Stripe payment (test card: 4242 4242 4242 4242)
- [ ] Confirm browser redirects to `/thank-you?sid=cs_...` then clean `/thank-you`
- [ ] Complete Google OAuth or magic link
- [ ] Confirm redirect to `/dashboard`
- [ ] SQL: confirm `profiles` row with `stripe_customer_id`, `onboarding_pending`
- [ ] SQL: confirm `subscriptions` row with `status = active`

### 2. Webhook health
- [ ] Stripe Dashboard → Webhooks → Recent deliveries
- [ ] `checkout.session.completed` → HTTP 200
- [ ] `customer.subscription.created` → HTTP 200
- [ ] SQL: check `stripe_webhook_events` — event locked and `processed_at` set

### 3. Entitlement gating
- [ ] After checkout, `GET /api/me/entitlements` returns plan data (not null/empty)
- [ ] Creator feed shows subscriber-only content when subscribed
- [ ] Creator feed shows only public content in incognito

### 4. Vault accessible
- [ ] Subscribed user can reach `/vault` without being redirected to onboarding
- [ ] `profiles.role` = `creator` after accessing vault

### 5. Worker health (if RunPod configured)
- [ ] Admin → Worker panel shows healthy status
- [ ] `system_events` has recent `worker_heartbeat` row
- [ ] Trigger one generation request and confirm job dispatched

---

## SQL queries for verification

```sql
-- Check profiles row after checkout
SELECT id, stripe_customer_id, onboarding_pending, role, created_at
FROM public.profiles
WHERE stripe_customer_id = 'cus_xxx';

-- Check subscription row
SELECT stripe_subscription_id, subscriber_id, creator_id, status, stripe_price_id, current_period_end
FROM public.subscriptions
WHERE stripe_subscription_id = 'sub_xxx';

-- Check webhook events processed
SELECT stripe_event_id, event_type, processed_at
FROM public.stripe_webhook_events
ORDER BY processed_at DESC
LIMIT 20;

-- Check recent generation jobs
SELECT id, status, runpod_job_id, output_path, created_at
FROM public.generation_jobs
ORDER BY created_at DESC
LIMIT 20;

-- Check worker heartbeat
SELECT event_type, created_at
FROM public.system_events
WHERE event_type = 'worker_heartbeat'
ORDER BY created_at DESC
LIMIT 5;
```

---

## Evidence log template

Copy this and fill in for any Phase A verification run:

```
Date/Time:
Tester:
Deployment URL:

Checkout:
- Session ID (cs_...):
- Customer ID (cus_...):
- Subscription ID (sub_...):
- Final URL after login:

Webhooks:
- checkout.session.completed: evt_xxx / timestamp / HTTP status
- customer.subscription.created: evt_xxx / timestamp / HTTP status

DB:
- profiles row created: yes/no
- subscriptions row created: yes/no
- stripe_webhook_events rows: yes/no

Gating:
- /api/me/entitlements returns plan: yes/no / plan key
- Vault accessible: yes/no
- Creator feed subscriber content visible: yes/no
- Non-subscriber sees only public: yes/no

Worker:
- Heartbeat in system_events: yes/no / timestamp
- Test generation job: created/dispatched/completed/failed
```
