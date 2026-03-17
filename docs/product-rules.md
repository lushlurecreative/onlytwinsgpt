# Product Rules

These are non-negotiable constraints that apply to every change. Violating any of these is a bug, not a tradeoff.

## Billing

- Never break the Stripe checkout → webhook → subscription provisioning chain.
- Never write to the `subscriptions` table except via the webhook route. The webhook is the only source of truth for subscription state.
- Always insert into `stripe_webhook_events` before processing any webhook event. Idempotency is mandatory.
- Never expose raw Stripe IDs, price IDs, subscription IDs, or invoice language to customers.
- Always check entitlements server-side (`lib/plan-entitlements.ts`, `lib/request-planner.ts`). Never trust client-side plan claims.

## Auth

- `proxy.ts` is the single enforcement point for route gating. Do not add auth logic elsewhere in middleware.
- Admin detection uses `lib/admin.ts` → `isAdminUser()` which checks `ADMIN_OWNER_EMAILS`. Do not add alternative admin detection.
- Admins must always land at `/admin` after login. Admins must never see the customer shell.
- Customers must never see admin pages.

## Database

- Never assume a column exists. Read `supabase/migrations/` before writing any DB code.
- Never invent columns or tables. If you need a new column, write a migration.
- Never use the Supabase service role client in client-side code.

## Generation

- The generation engine has an on/off switch: `GENERATION_ENGINE_ENABLED` env var. Always check `isGenerationEngineEnabled()` before processing jobs.
- Generation requests require an approved subject and training photos. Do not queue jobs without both.
- Mix saves are idempotent — use idempotency keys in the format `request-mix-save:{userId}:{cycleStart}`.

## UI

- No technical language in customer-facing UI. No Stripe terms, no RunPod references, no internal status codes.
- No debug text or console output in production UI.
- Admin components must not appear in the customer shell. Customer components must not appear in admin pages.
- Every interactive element needs loading, error, and success states.

## Schema changes

- All schema changes require a SQL migration file in `supabase/migrations/`.
- File naming: `YYYYMMDDNNNN_description.sql`
- Migrations must be idempotent (`IF NOT EXISTS`, `IF EXISTS`, constraint drop-before-recreate).
- After schema changes: note in deployment instructions that SQL must be run.

## Testing

- After any billing, auth, or generation change, run the full manual test paths in `docs/testing-checklist.md`.
- Do not ship a billing or auth change without testing the end-to-end flow.

## Copy standards

Do not expose to customers:
- "subscription_id", "stripe_customer_id", "invoice"
- "RunPod", "generation job", "worker"
- Raw error messages or stack traces
- HTTP status codes

Use instead:
- "Your plan" not "your subscription object"
- "Payment failed" not "invoice.payment_failed"
- "Generating your content" not "RunPod job pending"
- "Something went wrong, please try again" for unexpected errors
