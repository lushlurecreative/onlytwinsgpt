-- Multi-platform and content vertical support for leads.

alter table public.leads
  add column if not exists platforms_found text[] not null default '{}',
  add column if not exists profile_urls jsonb null default '{}',
  add column if not exists content_verticals text[] not null default '{}';
