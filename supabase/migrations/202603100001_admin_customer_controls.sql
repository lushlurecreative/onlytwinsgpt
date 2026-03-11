alter table public.subscriptions
  add column if not exists admin_notes text null,
  add column if not exists archived_at timestamptz null;

create index if not exists subscriptions_archived_at_idx
  on public.subscriptions(archived_at)
  where archived_at is not null;

