-- revenue_events: log revenue from Stripe (subscriptions/one-time). Optional lead_id for conversion attribution.
create table if not exists public.revenue_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  lead_id uuid null references public.leads(id) on delete set null,
  amount_cents integer not null,
  currency text not null default 'usd',
  stripe_event_id text null,
  plan_key text null,
  created_at timestamptz not null default timezone('utc', now())
);
create index if not exists revenue_events_user_id_idx on public.revenue_events(user_id);
create index if not exists revenue_events_lead_id_idx on public.revenue_events(lead_id) where lead_id is not null;
create index if not exists revenue_events_created_at_idx on public.revenue_events(created_at desc);
