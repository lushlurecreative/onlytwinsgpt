-- Add columns to profiles that the webhook handler expects but were never migrated.
-- Idempotent: uses add column if not exists throughout.

alter table public.profiles
  add column if not exists role text not null default 'consumer',
  add column if not exists suspended_at timestamptz null,
  add column if not exists subscription_status text null,
  add column if not exists updated_at timestamptz not null default now();

-- Ensure the service creator (admin) profile row exists so that subscriptions
-- with creator_id = SERVICE_CREATOR_ID pass the FK constraint.
-- The UUID here is the admin user: lush.lure.creative@gmail.com
-- On conflict (row already exists), update role to 'admin' to reflect ownership.
insert into public.profiles (id, role)
values ('7f68fd24-dd0f-467f-9b18-9e70adb63f02', 'admin')
on conflict (id) do update set role = 'admin';
