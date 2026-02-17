-- app_settings: admin-configured key/value (e.g. runpod_api_key, runpod_endpoint_id)
-- runpod_job_id: link our job to RunPod Serverless job for webhook status updates

create table if not exists public.app_settings (
  key text primary key,
  value text not null default '',
  updated_at timestamptz not null default timezone('utc', now())
);

-- Only service_role should read/write (no RLS for app_settings; use service_role in API)
comment on table public.app_settings is 'Admin-configured settings (RunPod API key, endpoint ID). Use service_role only.';

alter table public.training_jobs add column if not exists runpod_job_id text null;
alter table public.generation_jobs add column if not exists runpod_job_id text null;
create index if not exists training_jobs_runpod_job_id_idx on public.training_jobs(runpod_job_id) where runpod_job_id is not null;
create index if not exists generation_jobs_runpod_job_id_idx on public.generation_jobs(runpod_job_id) where runpod_job_id is not null;
