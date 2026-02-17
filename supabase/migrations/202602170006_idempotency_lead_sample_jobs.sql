-- Idempotency keys for automation (e.g. lead_sample per lead).
create table if not exists public.idempotency_keys (
  key text primary key,
  created_at timestamptz not null default timezone('utc', now())
);

-- generation_jobs: job_type (user | lead_sample) and lead_id for lead sample pipeline.
alter table public.generation_jobs add column if not exists job_type text not null default 'user'
  check (job_type in ('user', 'lead_sample'));
alter table public.generation_jobs add column if not exists lead_id uuid null
  references public.leads(id) on delete set null;
create index if not exists generation_jobs_lead_id_idx on public.generation_jobs(lead_id) where lead_id is not null;
create index if not exists generation_jobs_job_type_idx on public.generation_jobs(job_type);
