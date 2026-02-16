-- Add criteria (JSONB) to scrape_triggers for discovery rules per trigger.

alter table public.scrape_triggers
  add column if not exists criteria jsonb null default '{}';
