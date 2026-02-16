-- Creator briefs captured during onboarding.
-- Applied in Supabase SQL editor (migrations are not auto-applied).

create extension if not exists pgcrypto;

create table if not exists public.creator_briefs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  handle text not null,
  niche text not null,
  goals text not null,
  signature_style text not null,
  physical_constants text not null,
  dream_scenes text not null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint creator_briefs_user_id_unique unique(user_id)
);

create index if not exists creator_briefs_user_id_idx on public.creator_briefs(user_id);
create index if not exists creator_briefs_created_at_idx on public.creator_briefs(created_at desc);

alter table public.creator_briefs enable row level security;

drop policy if exists creator_briefs_owner_select on public.creator_briefs;
create policy creator_briefs_owner_select on public.creator_briefs
for select using (auth.uid() = user_id);

drop policy if exists creator_briefs_owner_insert on public.creator_briefs;
create policy creator_briefs_owner_insert on public.creator_briefs
for insert with check (auth.uid() = user_id);

drop policy if exists creator_briefs_owner_update on public.creator_briefs;
create policy creator_briefs_owner_update on public.creator_briefs
for update using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create or replace function public.set_creator_briefs_updated_at()
returns trigger as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$ language plpgsql;

drop trigger if exists creator_briefs_set_updated_at on public.creator_briefs;
create trigger creator_briefs_set_updated_at
before update on public.creator_briefs
for each row execute function public.set_creator_briefs_updated_at();

