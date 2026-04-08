-- SYSTEM 3: generation_outputs — per-output metadata registry
-- Tracks every individual output produced by generation jobs with full metadata.

create table if not exists public.generation_outputs (
  id uuid primary key default gen_random_uuid(),
  generation_request_id uuid null references public.generation_requests(id) on delete set null,
  generation_job_id uuid null references public.generation_jobs(id) on delete set null,
  user_id uuid not null references auth.users(id) on delete cascade,
  output_type text not null default 'image' check (output_type in ('image', 'video', 'thumbnail')),
  storage_path text not null,
  width integer null,
  height integer null,
  duration_seconds numeric(8,2) null,
  file_size integer null,
  is_watermarked boolean not null default false,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists generation_outputs_user_id_idx
  on public.generation_outputs(user_id);
create index if not exists generation_outputs_generation_request_id_idx
  on public.generation_outputs(generation_request_id);
create index if not exists generation_outputs_generation_job_id_idx
  on public.generation_outputs(generation_job_id);
create unique index if not exists generation_outputs_unique_path
  on public.generation_outputs(user_id, storage_path);

-- RLS: users can read their own outputs
alter table public.generation_outputs enable row level security;

create policy "Users can read own outputs"
  on public.generation_outputs for select
  using (auth.uid() = user_id);

-- Service role has full access (for webhook/worker inserts)
create policy "Service role full access on generation_outputs"
  on public.generation_outputs for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');
