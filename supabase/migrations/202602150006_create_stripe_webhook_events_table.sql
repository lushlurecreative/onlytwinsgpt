create table if not exists public.stripe_webhook_events (
  id uuid primary key default gen_random_uuid(),
  stripe_event_id text not null unique,
  event_type text not null,
  received_at timestamptz not null default now(),
  processed_at timestamptz
);

alter table public.stripe_webhook_events enable row level security;

create policy "stripe_webhook_events_select_admin_only"
  on public.stripe_webhook_events
  for select
  to authenticated
  using (false);

