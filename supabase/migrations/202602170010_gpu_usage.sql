-- gpu_usage: worker reports per-job GPU usage for cost tracking.
create table if not exists public.gpu_usage (
  id uuid primary key default gen_random_uuid(),
  job_type text not null check (job_type in ('training', 'generation', 'lead_sample')),
  job_id text not null,
  runpod_job_id text null,
  duration_sec numeric(12,2) not null default 0,
  cost_usd numeric(10,4) null,
  created_at timestamptz not null default timezone('utc', now())
);
create index if not exists gpu_usage_job_type_idx on public.gpu_usage(job_type);
create index if not exists gpu_usage_created_at_idx on public.gpu_usage(created_at desc);
