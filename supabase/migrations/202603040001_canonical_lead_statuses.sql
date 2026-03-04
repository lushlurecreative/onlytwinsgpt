do $$
begin
  if not exists (select 1 from pg_type where typname = 'lead_status_enum_v2') then
    create type public.lead_status_enum_v2 as enum (
      'new',
      'qualified',
      'rejected',
      'sample_queued',
      'sample_generated',
      'outreach_queued',
      'contacted',
      'replied',
      'converted'
    );
  end if;
end
$$;

alter table public.leads
  alter column status drop default;

alter table public.leads
  alter column status type public.lead_status_enum_v2
  using (
    case status::text
      when 'imported' then 'new'
      when 'approved' then 'qualified'
      when 'messaged' then 'contacted'
      when 'sample_done' then 'sample_generated'
      when 'outreach_sent' then 'contacted'
      when 'dead' then 'rejected'
      else status::text
    end
  )::public.lead_status_enum_v2;

alter table public.leads
  alter column status set default 'new'::public.lead_status_enum_v2;

do $$
begin
  if exists (select 1 from pg_type where typname = 'lead_status_enum') then
    drop type public.lead_status_enum;
  end if;
exception
  when dependent_objects_still_exist then
    null;
end
$$;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'lead_status_enum')
     and exists (select 1 from pg_type where typname = 'lead_status_enum_v2') then
    alter type public.lead_status_enum_v2 rename to lead_status_enum;
  end if;
end
$$;
