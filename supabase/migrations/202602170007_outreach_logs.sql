-- outreach_logs: one row per outreach send (DM) to a lead.
create table if not exists public.outreach_logs (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads(id) on delete cascade,
  sent_at timestamptz not null default timezone('utc', now()),
  platform text not null,
  message_preview text null,
  delivery_status text null default 'pending' check (delivery_status in ('pending', 'sent', 'failed', 'unknown')),
  created_at timestamptz not null default timezone('utc', now())
);
create index if not exists outreach_logs_lead_id_idx on public.outreach_logs(lead_id);
create index if not exists outreach_logs_sent_at_idx on public.outreach_logs(sent_at desc);
