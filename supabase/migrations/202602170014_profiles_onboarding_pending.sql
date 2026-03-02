-- Post-payment onboarding: flag so thank-you flow can gate readiness for users created by webhook.
alter table public.profiles
add column if not exists onboarding_pending boolean not null default false;

comment on column public.profiles.onboarding_pending is 'True when user was created by Stripe webhook (guest checkout); clear after post-payment account setup completes.';
