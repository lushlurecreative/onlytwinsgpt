-- Seed app_settings for automation. Run once in Supabase SQL Editor.
-- Replace lead_scrape_handles value with your comma-separated Instagram handles.

insert into public.app_settings (key, value, updated_at)
values
  ('lead_scrape_handles', '', 'now'::timestamptz),
  ('lead_sample_max_per_run', '10', 'now'::timestamptz),
  ('lead_sample_daily_budget_usd', '0', 'now'::timestamptz),
  ('outreach_max_attempts', '3', 'now'::timestamptz),
  ('outreach_cron_max_per_run', '20', 'now'::timestamptz)
on conflict (key) do update set
  value = excluded.value,
  updated_at = timezone('utc', now());

-- After running: edit lead_scrape_handles in Table Editor (app_settings)
-- and set value to e.g.  instagram_handle1,instagram_handle2
