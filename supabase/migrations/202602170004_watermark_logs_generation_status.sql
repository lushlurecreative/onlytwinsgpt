-- watermark_logs: forensic watermark audit; generation_jobs status: add upscaling, watermarking

create table if not exists public.watermark_logs (
  id uuid primary key default gen_random_uuid(),
  asset_type text not null check (asset_type in ('lead_sample', 'paid_output')),
  lead_id uuid null,
  user_id uuid null,
  generation_job_id uuid null,
  asset_path text not null,
  watermark_hash text not null,
  embedded_at timestamptz not null default timezone('utc', now()),
  algorithm_version text not null default '1',
  signature_version text not null default '1'
);
create index if not exists watermark_logs_watermark_hash_idx on public.watermark_logs(watermark_hash);
create index if not exists watermark_logs_lead_id_idx on public.watermark_logs(lead_id) where lead_id is not null;
create index if not exists watermark_logs_generation_job_id_idx on public.watermark_logs(generation_job_id) where generation_job_id is not null;

-- Allow generation_jobs.status to include upscaling, watermarking (full spec)
alter table public.generation_jobs drop constraint if exists generation_jobs_status_check;
alter table public.generation_jobs add constraint generation_jobs_status_check
  check (status in ('pending', 'running', 'upscaling', 'watermarking', 'completed', 'failed'));
