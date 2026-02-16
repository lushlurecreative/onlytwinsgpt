alter table public.generation_requests
add column if not exists content_mode text not null default 'sfw'
  check (content_mode in ('sfw', 'mature'));

create index if not exists generation_requests_content_mode_idx
  on public.generation_requests(content_mode);

