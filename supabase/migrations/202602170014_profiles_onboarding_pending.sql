-- Post-payment onboarding: flag so welcome page only allows password/profile update for users created by webhook.
alter table public.profiles
add column if not exists onboarding_pending boolean not null default false;

comment on column public.profiles.onboarding_pending is 'True when user was created by Stripe webhook (guest checkout); clear after /welcome complete.';
