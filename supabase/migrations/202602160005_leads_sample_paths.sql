-- Add sample_paths (3-5 scraped photos) and generated_sample_paths (AI outputs) to leads.

alter table public.leads
  add column if not exists sample_paths text[] not null default '{}',
  add column if not exists generated_sample_paths text[] not null default '{}';
