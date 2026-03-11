alter table public.leads
add column if not exists archived_at timestamptz null,
add column if not exists archived_by uuid null references auth.users(id),
add column if not exists archive_reason text null;

create index if not exists leads_archived_at_idx on public.leads (archived_at);
