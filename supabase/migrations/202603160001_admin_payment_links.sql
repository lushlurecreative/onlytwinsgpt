-- Admin-generated pay-now links (email + plan). When customer pays, webhook creates profile + subscription.
create table if not exists public.admin_payment_links (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null references public.profiles(id) on delete cascade,
  email text not null,
  plan text not null,
  stripe_checkout_session_id text null,
  checkout_url text null,
  full_name text null,
  admin_notes text null,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists admin_payment_links_creator_id_idx
  on public.admin_payment_links(creator_id);

create index if not exists admin_payment_links_created_at_idx
  on public.admin_payment_links(created_at desc);

comment on table public.admin_payment_links is 'Admin-created pay-now checkout links. When customer completes checkout, they become a paid customer via webhook.';
