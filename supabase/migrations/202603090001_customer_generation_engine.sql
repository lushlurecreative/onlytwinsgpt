-- Customer generation engine: canonical batch metadata, per-line mapping, cycle mixes, and job claim/retry fields.

alter table public.generation_requests
  add column if not exists source text not null default 'manual_save',
  add column if not exists cycle_start timestamptz null,
  add column if not exists cycle_end timestamptz null,
  add column if not exists mix_snapshot_json jsonb not null default '[]'::jsonb,
  add column if not exists autofill_snapshot_json jsonb not null default '[]'::jsonb,
  add column if not exists started_at timestamptz null,
  add column if not exists completed_at timestamptz null,
  add column if not exists failed_at timestamptz null;

create index if not exists generation_requests_user_cycle_idx
  on public.generation_requests(user_id, cycle_start, cycle_end, created_at desc);

create table if not exists public.generation_request_lines (
  id uuid primary key default gen_random_uuid(),
  generation_request_id uuid not null references public.generation_requests(id) on delete cascade,
  line_index integer not null default 0,
  line_type text not null check (line_type in ('photo', 'video')),
  quantity integer not null check (quantity >= 1),
  prompt text not null,
  scene_preset text not null,
  source text not null default 'user' check (source in ('user', 'auto_fill')),
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists generation_request_lines_request_idx
  on public.generation_request_lines(generation_request_id, line_index);

alter table public.generation_request_lines enable row level security;

drop policy if exists generation_request_lines_owner_select on public.generation_request_lines;
create policy generation_request_lines_owner_select on public.generation_request_lines
for select using (
  exists (
    select 1
    from public.generation_requests r
    where r.id = generation_request_lines.generation_request_id
      and r.user_id = auth.uid()
  )
);

create table if not exists public.recurring_request_mixes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  applies_cycle_start timestamptz not null,
  applies_cycle_end timestamptz not null,
  lines_json jsonb not null default '[]'::jsonb,
  source text not null default 'request_preferences_save',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (user_id, applies_cycle_start)
);

create index if not exists recurring_request_mixes_user_cycle_idx
  on public.recurring_request_mixes(user_id, applies_cycle_start, applies_cycle_end);

alter table public.recurring_request_mixes enable row level security;

drop policy if exists recurring_request_mixes_owner_select on public.recurring_request_mixes;
create policy recurring_request_mixes_owner_select on public.recurring_request_mixes
for select using (auth.uid() = user_id);

create or replace function public.set_recurring_request_mixes_updated_at()
returns trigger as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$ language plpgsql;

drop trigger if exists recurring_request_mixes_set_updated_at on public.recurring_request_mixes;
create trigger recurring_request_mixes_set_updated_at
before update on public.recurring_request_mixes
for each row execute function public.set_recurring_request_mixes_updated_at();

alter table public.generation_jobs
  add column if not exists generation_request_line_id uuid null references public.generation_request_lines(id) on delete set null,
  add column if not exists prompt_override text null,
  add column if not exists dispatch_retry_count integer not null default 0,
  add column if not exists lease_owner text null,
  add column if not exists lease_until timestamptz null;

create index if not exists generation_jobs_pending_claim_idx
  on public.generation_jobs(status, runpod_job_id, lease_until, created_at)
  where status = 'pending';

