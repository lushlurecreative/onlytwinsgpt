# Session Handoff Template

Copy this template at the end of each session. Fill it in completely. Paste into the next session as the opening message if Claude's context was reset.

---

## Session Goal

_What was this session trying to accomplish?_

> Example: Fix the generation eligibility failure — paid user getting "not currently eligible" on /requests.

---

## What Was Completed

_Bullet list of what was actually finished and verified._

- [ ] Item
- [ ] Item

---

## Files Changed

_Exact file paths. No summaries — list the files._

| File | Change type | Notes |
|---|---|---|
| `app/api/billing/webhook/route.ts` | edited | e.g. Treat placeholder creator UUID as absent |
| `supabase/migrations/YYYYMMDDNNNN_name.sql` | created | e.g. Add profiles.role column |

---

## Migrations Applied

_List any migrations that were pushed to production. State whether they ran before or after the code deploy._

| Migration file | Applied to production? | Order relative to deploy |
|---|---|---|
| `202603170001_add_missing_profile_columns.sql` | ✅ Yes | Before code deploy |

---

## Env Vars Changed

_List any Vercel env vars that were added or updated._

| Variable | Environment | Value / description |
|---|---|---|
| `SERVICE_CREATOR_ID` | Production | `7f68fd24-...` — admin user UUID |

---

## Decisions Made

_Any architectural or product decisions that would be opaque to a future reader._

- Why X was chosen over Y
- Why a column was added rather than using an existing one
- Why an event was replayed manually rather than waiting for Stripe retry

---

## Blockers Encountered

_What was hit and whether it was resolved._

| Blocker | Resolved? | Resolution or open question |
|---|---|---|
| `profiles.role` column missing | ✅ Yes | Migration 202603170001 adds it |
| Partial unique index incompatible with PostgREST upsert | ✅ Yes | Replaced with full constraint |

---

## Bugs / Risks Left Open

_Anything found but not fixed. Severity, location, and fix needed._

| Bug | Severity | File | Fix needed |
|---|---|---|---|
| Webhook outer catch doesn't call `markStripeEventProcessed` | Medium | `app/api/billing/webhook/route.ts:524` | Add `await markStripeEventProcessed(event.id)` in catch |
| Bitcoin checkout has no webhook handler | High (if BTC used) | `app/api/billing/bitcoin/checkout/route.ts` | Create `app/api/webhooks/coinbase/route.ts` |

---

## Exact Next Steps

_Numbered, in priority order. Specific enough to execute without context._

1. Run `docs/testing-checklist.md` sections 1–8 against production with a fresh test checkout
2. Set `GENERATION_ENGINE_ENABLED=true` in Vercel Production → Settings → Environment Variables
3. Configure RunPod via `/admin/worker` UI or set `RUNPOD_API_KEY` and `RUNPOD_ENDPOINT_ID` in Vercel
4. ...

---

## Required Tests Before Next Deploy

_Which sections of `docs/testing-checklist.md` must pass before pushing the next code change._

- [ ] Section 3 — Subscription checkout (after any billing change)
- [ ] Section 4 — Webhook sync / idempotency (after any webhook change)
- [ ] Section 1 — Admin login routing (after any proxy.ts or admin change)

---

## State of Key Tables (at session end)

_Snapshot of critical DB state. Helpful for resuming after a break._

| Table | Row count | Notes |
|---|---|---|
| `subscriptions` | 1 | `march17@gmail.com`, active starter plan |
| `profiles` | 2 | Admin + march17 test user |
| `stripe_webhook_events` (processed) | N | All processed_at is non-null |
| `stripe_webhook_events` (stuck) | 0 | None — all cleared |

---

## Current Test User

_For verifying the live flow without creating a new checkout._

| Field | Value |
|---|---|
| Email | `march17@gmail.com` |
| Supabase UID | `0e8cee46-062b-4487-9643-ad261e00e1a9` |
| Stripe Customer | `cus_UAD46x1mq7OXLo` |
| Stripe Subscription | `sub_1TBse4QX35kwmEJK0ACycty9` |
| Plan | starter |
| Status | active |

---

_Last session: 2026-03-18_
_Next session should begin by reading: `primer.md` → `docs/current-known-issues.md` → `docs/master-build-backlog.md`_
