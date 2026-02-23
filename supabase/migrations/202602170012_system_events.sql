-- system_events: worker_heartbeat and other system events for health checks.
-- Written by app (e.g. internal worker jobs route); read by admin health API via service role.

create table if not exists public.system_events (
  id uuid primary key default gen_random_uuid(),
  event_type text not null,
  payload jsonb not null default '{}',
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists system_events_event_type_created_at_idx
  on public.system_events (event_type, created_at desc);

alter table public.system_events enable row level security;

-- No select for authenticated (admin reads via service role in API).
create policy "system_events_no_direct_select"
  on public.system_events
  for select
  to authenticated
  using (false);
