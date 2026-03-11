alter table public.leads
  add column if not exists email text null;

create index if not exists leads_email_idx
  on public.leads(email)
  where email is not null;

