create table if not exists public.audit_log (
  id uuid primary key default gen_random_uuid(),
  actor text not null,
  action_type text not null,
  entity_ref text not null,
  before_json jsonb null,
  after_json jsonb null,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists audit_log_created_at_idx on public.audit_log(created_at desc);
create index if not exists audit_log_action_type_idx on public.audit_log(action_type);
create index if not exists audit_log_entity_ref_idx on public.audit_log(entity_ref);

alter table public.audit_log enable row level security;

drop policy if exists audit_log_admin_select on public.audit_log;
create policy audit_log_admin_select on public.audit_log
for select using (
  auth.uid() is not null
  and exists (
    select 1
    from public.app_settings s
    where s.key = 'admin_user_ids'
      and position(auth.uid()::text in coalesce(s.value, '')) > 0
  )
);

create or replace function public.prevent_audit_log_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception 'audit_log is append-only';
end;
$$;

drop trigger if exists audit_log_prevent_update on public.audit_log;
create trigger audit_log_prevent_update
before update on public.audit_log
for each row execute function public.prevent_audit_log_mutation();

drop trigger if exists audit_log_prevent_delete on public.audit_log;
create trigger audit_log_prevent_delete
before delete on public.audit_log
for each row execute function public.prevent_audit_log_mutation();
