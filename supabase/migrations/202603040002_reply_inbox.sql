create table if not exists public.reply_inbox (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid null references public.leads(id) on delete set null,
  handle text null,
  platform text null,
  message text not null,
  payload_json jsonb not null default '{}',
  received_at timestamptz not null default timezone('utc', now()),
  processed_at timestamptz null,
  processing_error text null
);

create index if not exists reply_inbox_processed_at_idx
  on public.reply_inbox (processed_at, received_at);
