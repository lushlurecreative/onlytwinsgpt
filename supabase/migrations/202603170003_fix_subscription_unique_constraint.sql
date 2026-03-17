-- The partial unique index on stripe_subscription_id is incompatible with
-- PostgREST upsert ON CONFLICT (stripe_subscription_id) — PostgreSQL cannot
-- match a non-conditional ON CONFLICT clause to a partial index, so it throws
-- 42P10 and the webhook subscription upsert always fails.
--
-- Fix: drop the partial index and replace with a full unique constraint.
-- NULL stripe_subscription_ids are excluded from uniqueness by SQL standard
-- (NULLs are not equal), so there is no collision risk.

drop index if exists subscriptions_stripe_subscription_id_uniq;

alter table public.subscriptions
  drop constraint if exists subscriptions_stripe_subscription_id_uniq;

alter table public.subscriptions
  add constraint subscriptions_stripe_subscription_id_uniq
  unique (stripe_subscription_id);
