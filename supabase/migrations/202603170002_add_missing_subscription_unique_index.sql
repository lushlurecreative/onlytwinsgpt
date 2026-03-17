-- The unique index on subscriptions.stripe_subscription_id was defined in
-- migration 202602150005 but was never applied to the production database.
-- Without it, the webhook's upsert(onConflict: "stripe_subscription_id") throws
-- 42P10 and no subscription row is ever created.

create unique index if not exists subscriptions_stripe_subscription_id_uniq
  on public.subscriptions (stripe_subscription_id)
  where stripe_subscription_id is not null;
