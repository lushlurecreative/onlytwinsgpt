# OnlyTwins — Session Primer

Read this at the start of every session. Update it at the end.

---

## Project

AI content generation SaaS. Operators (creators) subscribe, upload training photos, and receive a monthly batch of AI-generated content delivered to their vault. Automated lead engine sources creators via YouTube/Reddit/Instagram, generates sample content, and runs outreach.

Target: $80k–$150k/month. Hosted on Vercel. No staging environment — `main` is production.

**Shaun is not a developer. Claude is in full implementation mode.** See `docs/how-to-work-with-shaun.md`.

---

## Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16 App Router, React 19, TypeScript strict |
| Auth + DB | Supabase (Auth, Postgres + RLS, Storage) |
| Payments | Stripe (subscriptions, checkout, webhooks) |
| AI Workers | RunPod serverless (image generation, training) |
| Deploy | Vercel (GitHub `main` → auto-deploy, ~2 min) |
| Middleware | `proxy.ts` — single enforcement point for routing, auth, rate limiting |

---

## Current Phase: A (Revenue Reliability)

Phase A exit requires:
1. ✅ Stripe end-to-end: checkout → webhook → `profiles` + `subscriptions` rows created
2. ✅ Entitlements resolve correctly (`loadPriceIdPlanMap()` with `app_settings` fallback)
3. ✅ Thank-you race condition: polling waits for `profiles.stripe_customer_id` before `state: ready`
4. ✅ Webhook provisioning chain fixed: `profiles.role` column, `subscriptions_stripe_subscription_id_uniq` constraint, `SERVICE_CREATOR_ID` env var
5. ☐ Fresh end-to-end test: new checkout → new user provisioned → `/requests` saves eligible
6. ☐ `GENERATION_ENGINE_ENABLED=true` set in Vercel Production
7. ☐ `RUNPOD_API_KEY` and `RUNPOD_ENDPOINT_ID` configured in Vercel or admin `app_settings`

**Do not start Phase B work until items 5–7 are verified.**

---

## What is Working

- Auth login/logout, Google OAuth, email/password
- Admin routing: admin users → `/admin` only; customers → `/dashboard` only
- Stripe checkout session creation (plan mode + admin pay-link mode)
- Webhook idempotency (`stripe_webhook_events` insert-first lock)
- `checkout.session.completed` → auth user creation → profile upsert → subscription upsert
- `customer.subscription.created` → subscription upsert (idempotent)
- `SERVICE_CREATOR_ID` resolves to `7f68fd24-dd0f-467f-9b18-9e70adb63f02` (admin user)
- Admin shell: customers, leads, revenue, payment links, worker config, webhook events log
- Generation pipeline code (not live — blocked on `GENERATION_ENGINE_ENABLED`)
- Monthly scheduler + cron batch dispatch (code complete)
- Lead engine: scrape → ingest → sample → outreach → reply poll → conversion
- Usage ledger and enforcement, audit log, revenue events, watermark logs

---

## Known Blockers / Risks

| # | Issue | Severity | Status |
|---|---|---|---|
| 1 | Generation not running | High | `GENERATION_ENGINE_ENABLED` not set in Vercel |
| 2 | RunPod not configured | High | `RUNPOD_API_KEY` / `RUNPOD_ENDPOINT_ID` needed |
| 3 | `onboarding_pending` never cleared | Low | `POST /api/thank-you/complete` needs verification |
| 4 | Workspace split race | Medium | `/api/thank-you/session` checks profile but not subscription row |
| 5 | Lead conversion double-write | Low | `customer.subscription.created` handler still writes lead status twice |
| 6 | Bitcoin checkout has no webhook | High (if BTC used) | `app/api/billing/bitcoin/checkout/route.ts` — no Coinbase handler exists |
| 7 | Video generation lines skipped | Medium | `lib/customer-generation-processor.ts` skips non-photo line types |
| 8 | Webhook outer catch has no `markStripeEventProcessed` | Medium | Unhandled throws leave events locked permanently |

Full details: `docs/current-known-issues.md`

---

## Next Highest-Priority Tasks

### P0 — Complete Phase A
1. Run `docs/testing-checklist.md` sections 1–8 with a fresh test checkout
2. Set `GENERATION_ENGINE_ENABLED=true` in Vercel Production
3. Configure RunPod via admin UI at `/admin/worker` or set env vars

### P1 — Fix Before Phase B
4. Add `markStripeEventProcessed` to outer catch in `app/api/billing/webhook/route.ts`
5. Fix workspace split: check subscription row existence in `/api/thank-you/session`
6. Verify `onboarding_pending` cleared in `/api/thank-you/complete`
7. Remove duplicate lead status update from `customer.subscription.created` handler

### P2 — Phase B (Entitlement Hardening)
8. Cancellation/expiry gating on vault and generation
9. `past_due` grace period (3-day) verification
10. `/admin/subscription-health` view

Full backlog: `docs/master-build-backlog.md`

---

## Key Files / Directories

```
proxy.ts                           — Middleware: routing, auth, rate limiting, admin detection
lib/admin.ts                       — isAdminUser() — single truth for admin identity
lib/plan-entitlements.ts           — loadPriceIdPlanMap() + ENTITLEMENTS_BY_PLAN
lib/package-plans.ts               — PACKAGE_PLANS definition, plan keys
lib/service-creator.ts             — getServiceCreatorId() → SERVICE_CREATOR_ID env var
lib/request-planner.ts             — getCurrentSubscriptionSummary() → generation eligibility
lib/subscriptions.ts               — Subscription status helpers
lib/stripe.ts                      — Stripe client
lib/supabase-admin.ts              — Service role client (bypasses RLS)
lib/supabase-server.ts             — Server-side user-scoped client

app/api/billing/webhook/route.ts   — Stripe webhook handler (DO NOT touch without reading billing docs)
app/api/billing/checkout/route.ts  — Checkout session creation
app/api/me/entitlements/route.ts   — GET /api/me/entitlements
app/api/me/request-preferences/route.ts — Generation eligibility + mix save
app/api/thank-you/session/route.ts — Checkout readiness polling

supabase/migrations/               — 45 migrations; run before code deploy
docs/master-build-backlog.md       — What is left to build (read before every task)
docs/current-known-issues.md       — Active bugs (read before touching billing/auth/generation)
docs/testing-checklist.md          — Manual test steps (9 sections)
docs/env-vars.md                   — All env vars with status
```

---

## Active Test User

`march17@gmail.com` / Supabase ID: `0e8cee46-062b-4487-9643-ad261e00e1a9`
- Provisioned 2026-03-17 via webhook replay
- Active `starter` subscription, `stripe_subscription_id: sub_1TBse4QX35kwmEJK0ACycty9`
- No password set — use admin Supabase console to log in or send password reset

---

## How to Update This File

At the end of each session, update:
- **Current Phase** — check off completed items, add new blockers
- **What is Working** — add newly verified features
- **Known Blockers / Risks** — remove fixed issues, add new ones
- **Next Highest-Priority Tasks** — reorder based on what was completed
- **Active Test User** — update if a new test account was created

Do not change the structure. Keep it under 150 lines.
