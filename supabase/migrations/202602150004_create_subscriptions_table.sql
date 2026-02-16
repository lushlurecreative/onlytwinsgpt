-- Subscriber access scaffolding for future Stripe-backed entitlement checks.

create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null references public.profiles(id) on delete cascade,
  subscriber_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'active',
  current_period_end timestamptz,
  canceled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint subscriptions_status_check
    check (status in ('active', 'trialing', 'past_due', 'canceled', 'expired'))
);

create unique index if not exists subscriptions_creator_subscriber_uniq
  on public.subscriptions (creator_id, subscriber_id);

create index if not exists subscriptions_subscriber_id_idx
  on public.subscriptions (subscriber_id);

create index if not exists subscriptions_creator_id_idx
  on public.subscriptions (creator_id);

alter table public.subscriptions enable row level security;

drop policy if exists "subscriptions_select_own" on public.subscriptions;
create policy "subscriptions_select_own"
on public.subscriptions
for select
to authenticated
using (auth.uid() = subscriber_id or auth.uid() = creator_id);

