alter table public.subscriptions drop constraint if exists subscriptions_status_check;
alter table public.subscriptions
  add constraint subscriptions_status_check
  check (status in ('active', 'trialing', 'past_due', 'canceled', 'expired', 'incomplete', 'needs_review'));

