-- Add personal profile fields for creator onboarding.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS full_name text null,
  ADD COLUMN IF NOT EXISTS date_of_birth date null,
  ADD COLUMN IF NOT EXISTS phone text null,
  ADD COLUMN IF NOT EXISTS profile_complete boolean not null default false;
