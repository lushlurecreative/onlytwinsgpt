-- Leads expansion for automation: display_name, bio, photo_count, image_urls, status lifecycle, outreach fields.
-- automation_events: audit log for scrape_run, lead_qualified, job_enqueued, outreach_sent, job_completed, job_failed.

create table if not exists public.automation_events (
  id uuid primary key default gen_random_uuid(),
  event_type text not null,
  entity_type text null,
  entity_id text null,
  payload_json jsonb not null default '{}',
  created_at timestamptz not null default timezone('utc', now())
);
create index if not exists automation_events_event_type_idx on public.automation_events(event_type);
create index if not exists automation_events_created_at_idx on public.automation_events(created_at desc);

alter table public.leads add column if not exists display_name text null;
alter table public.leads add column if not exists bio text null;
alter table public.leads add column if not exists photo_count integer not null default 0;
alter table public.leads add column if not exists image_urls_json jsonb null default '[]';
alter table public.leads add column if not exists last_seen_at timestamptz null;
alter table public.leads add column if not exists is_new boolean not null default true;
alter table public.leads add column if not exists sample_asset_path text null;
alter table public.leads add column if not exists outreach_last_sent_at timestamptz null;
alter table public.leads add column if not exists outreach_attempts integer not null default 0;

do $$ begin
  if exists (select 1 from pg_constraint where conname = 'leads_status_check') then
    alter table public.leads drop constraint leads_status_check;
  end if;
exception when undefined_object then null;
end $$;
alter table public.leads add constraint leads_status_check check (status in (
  'imported', 'approved', 'messaged', 'rejected',
  'qualified', 'sample_queued', 'sample_done', 'outreach_sent', 'replied', 'converted', 'dead'
));

create unique index if not exists leads_platform_handle_key on public.leads(platform, handle);
