-- user_notifications: in-app notifications (e.g. vault ready).
create table if not exists public.user_notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  type text not null,
  payload_json jsonb not null default '{}',
  read_at timestamptz null,
  created_at timestamptz not null default timezone('utc', now())
);
create index if not exists user_notifications_user_id_read_at_idx on public.user_notifications(user_id, read_at);
