-- Stripe linkage columns for billing and entitlement synchronization.

alter table public.profiles
add column if not exists stripe_customer_id text;

create unique index if not exists profiles_stripe_customer_id_uniq
  on public.profiles (stripe_customer_id)
  where stripe_customer_id is not null;

alter table public.subscriptions
add column if not exists stripe_subscription_id text,
add column if not exists stripe_price_id text;

create unique index if not exists subscriptions_stripe_subscription_id_uniq
  on public.subscriptions (stripe_subscription_id)
  where stripe_subscription_id is not null;

