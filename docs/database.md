# Database

## Source of truth

`supabase/migrations/` is the definitive schema reference. Always read the relevant migration files before writing any query, RPC call, or schema change. Do not assume any column exists.

## Tables

### `profiles` (Supabase Auth auto-created, extended)
Columns added by migrations:
- `stripe_customer_id` text UNIQUE — added in `202602150005`
- `onboarding_pending` boolean — added in `202602170014`
- `role` text — used by `lib/entitlements.ts` (values: `creator`, `consumer`, `admin`)
- `is_creator` boolean — checked in `getEntitlements()`
- `subscription_status` text — cached status, checked as fallback in `getEntitlements()`

### `subscriptions` — `202602150004`, `202602150005`, `202603100002`
- `id` uuid PK
- `creator_id` uuid → `profiles.id`
- `subscriber_id` uuid → `profiles.id`
- `status` text — allowed: `active`, `trialing`, `past_due`, `canceled`, `expired`, `incomplete`, `needs_review`
- `current_period_end` timestamptz
- `canceled_at` timestamptz
- `stripe_subscription_id` text UNIQUE
- `stripe_price_id` text
- UNIQUE INDEX on `(creator_id, subscriber_id)`

**Written only by:** `app/api/billing/webhook/route.ts`. Never write to this table from any other route.

### `stripe_webhook_events` — `202602150006`
- `stripe_event_id` text UNIQUE — idempotency key
- `event_type` text
- `processed_at` timestamptz (null until processing complete)

**Always insert here first** before processing any webhook event. Duplicate insert (PG code `23505`) means already processed — skip.

### `generation_requests` — `202602160001`, `202602160003`, `202603090001`
- `id` uuid PK
- `user_id` uuid
- `status` text — `pending`, `generating`, `completed`, `failed`
- `content_mode` text — `sfw`, `mature`
- `source` text — `manual_save`, `monthly_scheduler`, `api_generation_request`, `vault_generate`, `generate_images`
- `cycle_start` timestamptz
- `cycle_end` timestamptz
- `mix_snapshot_json` jsonb — array of MixLine objects
- `autofill_snapshot_json` jsonb
- `sample_paths` text[]
- `identity_model_id` uuid → `identity_models.id` (added in 202604050002) — which model version was used
- `started_at`, `completed_at`, `failed_at` timestamptz
- `admin_notes` text — set on failure for diagnostics
- `failure_reason` text — structured failure reason (added in 202604060001)

### `generation_request_lines` — `202603090001`
- `id` uuid PK
- `generation_request_id` uuid → `generation_requests.id`
- `line_index` integer
- `line_type` text — `photo`, `video`
- `quantity` integer
- `prompt` text
- `scene_preset` text
- `source` text — `user`, `auto_fill`

### `recurring_request_mixes` — `202603090001`
- `id` uuid PK
- `user_id` uuid UNIQUE with `applies_cycle_start`
- `applies_cycle_start` timestamptz
- `applies_cycle_end` timestamptz
- `lines_json` jsonb
- `source` text — `request_preferences_save`

### `generation_jobs` — `202602160001`, extended in `202603090001`
- `id` uuid PK
- `generation_request_id` uuid → `generation_requests.id` (added in 202603090001)
- `generation_request_line_id` uuid → `generation_request_lines.id`
- `subject_id` uuid
- `preset_id` uuid
- `runpod_job_id` text
- `status` enum ��� `pending`, `running`, `upscaling`, `watermarking`, `completed`, `failed`, `cancelled`
- `failure_reason` text — structured failure reason (added in 202604060001)
- `prompt_override` text
- `dispatch_retry_count` integer
- `lease_owner` text
- `lease_until` timestamptz

### `generation_outputs` — `202604050001`
- `id` uuid PK
- `generation_request_id` uuid → `generation_requests.id`
- `generation_job_id` uuid → `generation_jobs.id`
- `user_id` uuid → `auth.users.id`
- `output_type` text — `image`, `video`, `thumbnail`
- `storage_path` text (unique per user)
- `width` integer, `height` integer, `duration_seconds` numeric, `file_size` integer
- `is_watermarked` boolean
- RLS: users read own; service_role full access

**Written by:** `app/api/webhooks/runpod/route.ts` (via `lib/generation-outputs.ts`)

### `posts` — `202602150001`, `202602150002`, `202602150003`, `202604050002`
- `id` uuid PK
- `creator_id` uuid → `profiles.id`
- `visibility` — enum added in 202602150003
- `storage_path` text
- `generation_job_id` uuid → `generation_jobs.id` (added in 202604050002)

### `leads` — `202602160002`, `202602160008`, `202603040001`, `202603100003`, `202603110001`
- `id` uuid PK
- `platform` text — `youtube`, `reddit`, `instagram`
- `handle` text
- `status` text — canonical statuses defined in `202603040001`
- `email` text — added in `202603100003`
- `archived_at` timestamptz — soft archive, added in `202603110001`

### `leads_sample_paths` — `202602160005`
- `lead_id` uuid → `leads.id`
- `path` text

### `subjects` — `202602170000`, `202602170001`, `202602170002`
- `id` uuid PK
- `user_id` uuid → `profiles.id`
- `status` text
- RLS: users can only read/write their own subjects

### `admin_payment_links` — `202603160001`
- `id` uuid PK
- `creator_id` uuid → `profiles.id`
- `email` text
- `plan` text
- `stripe_checkout_session_id` text
- `checkout_url` text
- `full_name` text
- `admin_notes` text

### `presets` (scenes catalog) — `202602170000`, enriched in `202604050002`
- `id` uuid PK
- `name` text — scene display name
- `type` text — `image` or `video` (added in 202604050002)
- `status` text — `active`, `draft`, `archived` (added in 202604050002)
- `prompt` text, `negative_prompt` text
- `thumbnail_path` text (added in 202604050002)
- `camera_instructions` text, `pose_instructions` text (added in 202604050002)
- `wardrobe_tags` text[], `environment_tags` text[] (added in 202604050002)
- `sort_order` integer (added in 202604050002)
- `parameter_json` jsonb, `provider_defaults_json` jsonb

9 presets seeded: Beach, Camping, Coffee shop, Swimsuit try-on, Gym, Casual home, Street style, Nightlife, City

### `job_events` — `202604060001` (System 4)
- `id` uuid PK
- `job_type` text — `training`, `generation`, `generation_request`, `identity_model`, `photo_validation`
- `job_id` text — references various job tables
- `event` text — `created`, `dispatched`, `running`, `completed`, `failed`, `cancelled`, `retried`, `reaped`, `refunded`, `callback_received`, `callback_duplicate`, `status_change`
- `message` text — human-readable detail or error
- `meta_json` jsonb — structured metadata
- Indexes: `(job_type, job_id, created_at)`, `(event, created_at)`, `(created_at)`, dedup `(job_id, event)`
- Used for RunPod callback dedup and lifecycle audit trail

### Other tables (see migrations for full columns)
- `watermark_logs` — `202602170004`
- `outreach_logs` — `202602170007`
- `revenue_events` — `202602170008`
- `user_notifications` — `202602170009`
- `gpu_usage` — `202602170010`
- `system_events` — `202602170012`
- `audit_log` — `202602260001`
- `usage_ledger` — `202602260002` (source: `generation_request` or `refund` for credit returns)
- `reply_inbox` — `202603040002`
- `app_settings` — key/value store; `request_mix:{userId}` keys store generation preferences

## Key RPCs

- `convert_lead_to_customer(p_lead_id, p_subscriber_id, p_creator_id, p_stripe_subscription_id, p_plan)` — `202602170013`
- `enforce_usage_limit(...)` — `202602260003`

## RLS rules

- All user-data tables have RLS enabled
- Users can only select/modify their own rows
- `supabase-admin.ts` (service role) bypasses RLS — use only in server-side admin/cron/worker code

## Migration rules

- File naming: `YYYYMMDDNNNN_description.sql`
- Use `IF NOT EXISTS` / `IF EXISTS` / drop-before-recreate for idempotency
- Always add `GRANT` after creating tables
- Drop and recreate constraints rather than `ALTER ... ADD CONSTRAINT` on existing ones
- After running migrations in production, update deployment notes

## Subscription lookup pattern

`lib/request-planner.ts` → `getCurrentSubscriptionSummary()`:
1. Look for `subscriptions` row where `subscriber_id = userId AND creator_id = serviceCreatorId` (done-for-you plan)
2. Fallback: any active/trialing subscription for the user
3. Map `stripe_price_id` → plan key via `getPlanKeyForStripePriceId()`
4. Return `includedImages`, `includedVideos`, `nextRenewalAt`, `status`
