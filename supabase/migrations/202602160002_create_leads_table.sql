create table if not exists public.leads (
  id uuid primary key default gen_random_uuid(),
  source text not null,
  handle text not null,
  platform text not null,
  follower_count integer not null default 0,
  engagement_rate numeric(5,2) not null default 0,
  luxury_tag_hits integer not null default 0,
  score integer not null default 0,
  status text not null default 'imported'
    check (status in ('imported', 'approved', 'messaged', 'rejected')),
  profile_url text null,
  notes text null,
  sample_preview_path text null,
  approved_by uuid null references auth.users(id),
  approved_at timestamptz null,
  messaged_at timestamptz null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists leads_status_idx on public.leads(status);
create index if not exists leads_score_idx on public.leads(score desc);
create index if not exists leads_platform_idx on public.leads(platform);

alter table public.leads enable row level security;

drop policy if exists leads_admin_select on public.leads;
drop policy if exists leads_admin_insert on public.leads;
drop policy if exists leads_admin_update on public.leads;

create or replace function public.set_leads_updated_at()
returns trigger as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$ language plpgsql;

drop trigger if exists leads_set_updated_at on public.leads;
create trigger leads_set_updated_at
before update on public.leads
for each row execute function public.set_leads_updated_at();

