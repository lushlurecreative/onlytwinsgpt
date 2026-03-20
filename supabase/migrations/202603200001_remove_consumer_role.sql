-- Remove consumer role: all users are creators.
-- Update any remaining consumer rows to creator.
UPDATE public.profiles SET role = 'creator' WHERE role = 'consumer';

-- Fix column default and check constraint.
ALTER TABLE public.profiles ALTER COLUMN role SET DEFAULT 'creator';

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'profiles_role_check') THEN
    ALTER TABLE public.profiles DROP CONSTRAINT profiles_role_check;
  END IF;
  ALTER TABLE public.profiles ADD CONSTRAINT profiles_role_check CHECK (role IN ('creator', 'admin'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
