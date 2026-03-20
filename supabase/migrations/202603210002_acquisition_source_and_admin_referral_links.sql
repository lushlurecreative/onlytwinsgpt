-- Track where customers came from (direct, referral, scraper/lead)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS acquisition_source text;

-- Admin-generated referral/affiliate/partner links (not tied to a user account)
CREATE TABLE IF NOT EXISTS public.admin_referral_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL,
  label text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS admin_referral_links_code_uniq
  ON public.admin_referral_links (code);

-- RLS: admin-only (service role bypasses RLS; no need for a policy here)
ALTER TABLE public.admin_referral_links ENABLE ROW LEVEL SECURITY;
