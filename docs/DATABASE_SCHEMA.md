# Database Schema

> **Source of truth**: `supabase/migrations/` — always read migrations before writing DB code.

## Core Tables

### `profiles`
Auto-created by Supabase Auth. Extended with:
- `id` — UUID (matches `auth.users.id`)
- `email` — text
- `role` — text (e.g. `consumer`, `creator`, `admin`)
- `onboarding_pending` — boolean

### `subscriptions`
Mirrors Stripe subscription state.
- `id` — UUID
- `user_id` — UUID → `profiles.id`
- `stripe_subscription_id` — text
- `stripe_customer_id` — text
- `status` — enum (see migration 202603100002)
- `plan` — text
- `current_period_end` — timestamptz

### `posts`
Creator content.
- `id` — UUID
- `creator_id` — UUID → `profiles.id`
- `visibility` — enum (see migration 202602150003)
- `storage_path` — text
- `created_at` — timestamptz

### `generation_requests`
Customer generation job requests.
- `id` — UUID
- `user_id` — UUID → `profiles.id`
- `status` — enum
- `content_mode` — text (added migration 202602160003)
- `created_at` — timestamptz

### `generation_jobs`
Individual generation job tracking.
- `id` — UUID
- `request_id` — UUID → `generation_requests.id`
- `runpod_job_id` — text
- `status` — enum
- `result_path` — text (storage path on completion)

### `training_jobs`
Model training tracking.
- `id` — UUID
- `user_id` — UUID → `profiles.id`
- `runpod_job_id` — text
- `status` — enum

### `leads`
Scraped creator prospects.
- `id` — UUID
- `platform` — text (youtube, reddit, instagram)
- `handle` — text
- `status` — enum (canonical statuses: migration 202603040001)
- `email` — text (added migration 202603100003)
- `archived_at` — timestamptz (soft archive: migration 202603110001)

### `subjects`
Consent and identity verification records.
- `id` — UUID
- `user_id` — UUID → `profiles.id`
- `status` — enum
- RLS policies: migrations 202602170001, 202602170002

### `stripe_webhook_events`
Idempotency log for Stripe webhooks.
- `stripe_event_id` — text UNIQUE
- `processed_at` — timestamptz
- Always insert here before processing any webhook event.

### `audit_log`
Admin action log (migration 202602260001).
- `id` — UUID
- `admin_id` — UUID → `profiles.id`
- `action` — text
- `target_id` — text
- `created_at` — timestamptz

### `usage_ledger`
Usage tracking and enforcement (migration 202602260002).
- `user_id` — UUID
- `resource` — text
- `amount` — integer
- RPC: `enforce_usage_limit()` — see migration 202602260003

### `admin_payment_links`
Admin-created payment links (migration 202603160001).

## Key RPCs
- `convert_lead_to_customer(lead_id)` — migration 202602170013
- `enforce_usage_limit(user_id, resource, amount)` — migration 202602260003

## RLS Notes
- All tables with user data have Row Level Security enabled
- Use `lib/supabase-admin.ts` (service role) only for admin, cron, and worker operations — it bypasses RLS
- Never use the service role key in client-side code

## Migration Conventions
- File naming: `YYYYMMDDNNNN_description.sql`
- Use `IF NOT EXISTS` / `IF EXISTS` for idempotency
- Always add `GRANT` statements after creating tables
- RLS policies follow pattern: users can only read/write their own rows
