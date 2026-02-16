-- Scrape triggers: OnlyTwins creates one when user clicks "Run scrape", Antigravity polls and consumes it.

create table if not exists public.scrape_triggers (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists scrape_triggers_created_at_idx on public.scrape_triggers(created_at);

alter table public.scrape_triggers enable row level security;
