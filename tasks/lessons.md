# Lessons & Rules

Operational rules derived from this codebase. Each rule has a cause. Apply them before touching the relevant code.

---

## Architecture Rules

- **`proxy.ts` is the only middleware.** All auth enforcement, admin routing, and rate limiting lives there. Do not add middleware elsewhere.
- **`lib/admin.ts` is the only admin-identity check.** `isAdminUser()` reads `ADMIN_OWNER_EMAILS`. Never hardcode email comparisons anywhere else.
- **`lib/supabase-admin.ts` is the only service-role client.** Any DB write that bypasses RLS must go through `getSupabaseAdmin()`. Never pass service-role key to a client-accessible function.
- **Business logic lives in `lib/`.** Routes in `app/api/` are thin orchestrators. Do not embed logic in routes that should be reusable.
- **`app/api/billing/webhook/route.ts` is the only file that writes to `subscriptions`.** No other file may insert or update subscription rows.
- **Stripe price IDs are dual-sourced.** They are in `STRIPE_PRICE_ID_*` env vars AND in `app_settings` table (populated by checkout). Always use `loadPriceIdPlanMap()` (async, checks both), never `getPlanKeyForStripePriceId()` (sync, env-only) outside the webhook.
- **`getServiceCreatorId()` must return a UUID that exists in `profiles`.** The fallback `00000000-0000-4000-8000-000000000001` never exists in `profiles.id` because `profiles.id` has FK → `auth.users.id`. Always set `SERVICE_CREATOR_ID` in Vercel.
- **Migrations are applied manually via `supabase db push`.** Run all prior migrations with `supabase migration repair --status applied` before pushing new ones. Run SQL before code deploy, never after.

---

## Auth / Billing / Data Safety Rules

- **Webhook idempotency is non-negotiable.** The `stripe_webhook_events` insert must be the FIRST write in the handler. If the insert fails with `23505` (duplicate), return `{received: true, duplicate: true}` with 200. Never skip this lock.
- **Both catch paths in the webhook must call `markStripeEventProcessed`.** Unhandled exceptions in the outer catch leave `processed_at = null`, permanently locking the event. Future Stripe retries will hit the duplicate lock and silently skip. This means lost customers. Fix: add `markStripeEventProcessed` to the outer catch.
- **`onConflict` upserts require a full unique constraint, not a partial index.** PostgREST `ON CONFLICT (column)` cannot match a partial index (`WHERE col IS NOT NULL`). It will throw `42P10`. Use `ALTER TABLE ... ADD CONSTRAINT ... UNIQUE (column)` instead of `CREATE UNIQUE INDEX ... WHERE`.
- **`profiles.role` is required by the webhook.** The webhook upserts `{role: "creator"}` into `profiles`. If the column is missing, every `checkout.session.completed` handler throws, leaving events locked. Always check `profiles` columns before writing webhook code.
- **The placeholder creator UUID `00000000-0000-4000-8000-000000000001` is invalid in production.** It was the `getServiceCreatorId()` fallback before `SERVICE_CREATOR_ID` was set. Any checkout or subscription event with this UUID as `creator_id` in metadata will fail the FK constraint on `subscriptions.creator_id`. Treat it as absent in webhook code.
- **`profiles.id` has FK → `auth.users.id`.** You cannot insert a profile row for a UUID that does not exist in `auth.users`. Do not attempt to pre-create placeholder profiles for service UUIDs without first creating the auth user.
- **Never write to `subscriptions` outside the webhook handler.** If a subscription row needs to be manually patched, use the Supabase service role REST API directly, and document why.
- **RLS is on for all user-facing tables.** Always use `getSupabaseAdmin()` for server-side writes that touch profile data, subscriptions, or webhook events. The user-scoped client will silently fail or return empty if RLS blocks the query.
- **`failAfterLock(status, body)` marks the event processed regardless of status code.** A 400 or 500 response to Stripe means Stripe will retry. The event IS marked as processed in our DB after `failAfterLock`. Next retry hits the duplicate lock → returns 200 → Stripe stops. Net result: event silently "processed" with no data written.

---

## UI / App Router / Repo Structure Rules

- **Admin and customer shells must never share nav components.** Admin nav is in `app/admin/layout.tsx`. Customer nav is in the customer shell layout. They must not import each other.
- **No customer-facing Stripe language.** Never render `stripe_subscription_id`, `stripe_price_id`, price IDs, or plan keys in customer UI. Map them to human-readable copy.
- **No technical error text in customer UI.** Map all API error states to plain English. No status codes, no Supabase error messages, no raw exception text.
- **Loading / error / success states are required on every interactive element.** No button should submit without disabling and showing a spinner. No form should fail without telling the user what happened.
- **App Router server components cannot use browser APIs.** Keep `useState`, `useEffect`, and event handlers in client components. Mark them `"use client"`.
- **Cron handlers verify `Authorization: Bearer CRON_SECRET`.** All routes in `app/api/cron/` must check this header. Do not add unprotected cron routes.
- **Internal worker routes verify `X-Worker-Secret`.** All routes in `app/api/internal/worker/` must check the shared `WORKER_SECRET`. Do not add unprotected internal routes.
- **`docs/` must be updated when routes or flows change.** The 13 canonical docs (`docs/architecture.md`, `docs/stripe-billing.md`, etc.) are the source of truth. If you change a flow, update the doc that describes it.

---

## Testing / Verification Rules

- **After any billing change:** Run `docs/testing-checklist.md` sections 3, 4, 8. Confirm idempotency by replaying the webhook event.
- **After any auth change:** Run sections 1, 2, 9. Confirm admin cannot reach customer routes and vice versa.
- **After any generation change:** Run sections 5, 6, 7. Confirm `GENERATION_ENGINE_ENABLED` gate is respected.
- **After any DB migration:** Verify with a direct REST API probe that the column/index/constraint exists in production before deploying code that depends on it.
- **Always verify webhook events in `stripe_webhook_events`:** `processed_at` must be set (non-null) after a replay. If it's null, the handler threw an unhandled exception.
- **After fixing a webhook bug:** Delete the stuck events from `stripe_webhook_events` (those with `processed_at = null`) before replaying. Otherwise the duplicate lock fires and the fix never runs.
- **Confirm `subscriptions` has a row after checkout.** An empty `subscriptions` table means the webhook provisioning chain is broken. A profile with `stripe_customer_id` but no subscription = webhook partially ran.

---

## Mistakes to Avoid

| Mistake | Consequence | Prevention |
|---|---|---|
| Touching billing code without reading `docs/stripe-billing.md` | Breaking the checkout → webhook → provision chain | Always read the doc first |
| Using `getPlanKeyForStripePriceId()` in new code | Returns null when env vars not set; entitlements break | Use `loadPriceIdPlanMap()` |
| Creating a partial unique index instead of a constraint for upsert targets | `42P10` error; PostgREST upsert silently fails | Use `ADD CONSTRAINT ... UNIQUE` |
| Forgetting `markStripeEventProcessed` in catch blocks | Events stuck null; future retries silently skipped | Check all code paths call it |
| Using user-scoped Supabase client for writes that need service role | Silent RLS block; no error returned | Audit which client is used before writing |
| Setting `SERVICE_CREATOR_ID` to a UUID not in `profiles` | FK violation on every subscription insert | Verify UUID in profiles before setting |
| Deploying code before running the required migration | Runtime DB errors; webhook failures | SQL → deploy order, always |
| Adding columns to profiles without a migration | Column exists in code, not in DB; webhook throws | Always write a migration, never assume |
| Pushing to `main` without testing on the relevant checklist section | Breaking production for real users | Run the relevant checklist first |

---

## Lessons Learned

- **Production DB can silently diverge from migrations.** All 45 migrations showed empty "Remote" column in `supabase migration list` — they were applied manually without tracking. Use `supabase migration repair --status applied` to sync, then `supabase db push` for new migrations only.
- **`vercel env pull` stores multiline env var values as `\n`.** In production, this becomes a real newline that `.trim()` removes. Do not be misled by the `.env.local` representation.
- **Stripe `events resend` requires a `--webhook-endpoint` flag.** Without it, it tries to send to a CLI listener (which is not running). Always pass `--webhook-endpoint we_...`.
- **A webhook returning 400/500 does NOT permanently mark the event as failed.** Stripe retries all non-2xx responses. After our `failAfterLock` marks it processed in our DB, the next retry gets a 200 (duplicate). Net result: event is silently "processed" whether or not the actual DB writes succeeded.
- **Old checkouts stored placeholder `creator_id` in Stripe metadata.** If you need to replay old events, those events will still have `creator_id: 00000000-0000-4000-8000-000000000001` in their Stripe metadata — the webhook must treat that as absent and fall back to `getServiceCreatorId()`.
- **The `subscriptions_creator_subscriber_uniq` constraint can block upserts on replay.** If a subscription row was inserted manually (for recovery), and the webhook tries to upsert the same `(creator_id, subscriber_id)` pair with a different conflict target (`stripe_subscription_id`), it hits this constraint. The upsert's `onConflict` must match the conflict that will actually trigger.
