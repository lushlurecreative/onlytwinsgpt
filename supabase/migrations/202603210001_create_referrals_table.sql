-- Referral system: one row per referrer, tracks code, redemption, and discount status.

create table if not exists public.referrals (
  id uuid primary key default gen_random_uuid(),
  referrer_id uuid not null references public.profiles(id) on delete cascade,
  code text not null,
  referred_user_id uuid references public.profiles(id) on delete set null,
  redeemed_at timestamptz,
  discount_applied_at timestamptz,
  created_at timestamptz not null default now()
);

create unique index if not exists referrals_code_uniq on public.referrals (code);
create unique index if not exists referrals_referrer_uniq on public.referrals (referrer_id);
create index if not exists referrals_referred_user_idx on public.referrals (referred_user_id);

alter table public.referrals enable row level security;

drop policy if exists "referrals_select_own" on public.referrals;
create policy "referrals_select_own"
on public.referrals for select
to authenticated
using (auth.uid() = referrer_id);
