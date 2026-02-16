create table if not exists public.generation_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  sample_paths text[] not null,
  scene_preset text not null,
  image_count integer not null default 10,
  video_count integer not null default 0,
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected', 'generating', 'completed', 'failed')),
  admin_notes text null,
  approved_by uuid null references auth.users(id),
  approved_at timestamptz null,
  progress_done integer not null default 0,
  progress_total integer not null default 0,
  retry_count integer not null default 0,
  output_paths text[] not null default '{}',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists generation_requests_user_id_idx on public.generation_requests(user_id);
create index if not exists generation_requests_status_idx on public.generation_requests(status);
create index if not exists generation_requests_created_at_idx on public.generation_requests(created_at desc);

alter table public.generation_requests enable row level security;

drop policy if exists generation_requests_owner_select on public.generation_requests;
create policy generation_requests_owner_select on public.generation_requests
for select using (auth.uid() = user_id);

drop policy if exists generation_requests_owner_insert on public.generation_requests;
create policy generation_requests_owner_insert on public.generation_requests
for insert with check (auth.uid() = user_id);

drop policy if exists generation_requests_owner_update on public.generation_requests;
create policy generation_requests_owner_update on public.generation_requests
for update using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create or replace function public.set_generation_requests_updated_at()
returns trigger as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$ language plpgsql;

drop trigger if exists generation_requests_set_updated_at on public.generation_requests;
create trigger generation_requests_set_updated_at
before update on public.generation_requests
for each row execute function public.set_generation_requests_updated_at();

