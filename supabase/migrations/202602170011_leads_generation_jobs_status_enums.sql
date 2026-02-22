-- Convert leads.status and generation_jobs.status from TEXT + check to PostgreSQL ENUMs.

-- Create enum types (idempotent: ignore if already exist)
do $$
begin
  if not exists (select 1 from pg_type where typname = 'lead_status_enum') then
    create type public.lead_status_enum as enum (
      'imported', 'approved', 'messaged', 'rejected', 'qualified', 'sample_queued',
      'sample_done', 'outreach_sent', 'replied', 'converted', 'dead'
    );
  end if;
  if not exists (select 1 from pg_type where typname = 'generation_job_status_enum') then
    create type public.generation_job_status_enum as enum (
      'pending', 'running', 'upscaling', 'watermarking', 'completed', 'failed'
    );
  end if;
end
$$;

-- leads: drop check constraint then alter column type
alter table public.leads drop constraint if exists leads_status_check;
alter table public.leads
  alter column status type public.lead_status_enum
  using status::text::public.lead_status_enum;
alter table public.leads alter column status set default 'imported'::public.lead_status_enum;

-- generation_jobs: drop check constraint then alter column type
alter table public.generation_jobs drop constraint if exists generation_jobs_status_check;
alter table public.generation_jobs
  alter column status type public.generation_job_status_enum
  using status::text::public.generation_job_status_enum;
alter table public.generation_jobs alter column status set default 'pending'::public.generation_job_status_enum;
