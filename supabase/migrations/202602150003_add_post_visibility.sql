-- Add visibility gating foundation for future paid-access rules.

alter table public.posts
add column if not exists visibility text;

update public.posts
set visibility = 'public'
where visibility is null;

alter table public.posts
alter column visibility set default 'public',
alter column visibility set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'posts_visibility_check'
  ) then
    alter table public.posts
    add constraint posts_visibility_check
    check (visibility in ('public', 'subscribers'));
  end if;
end $$;

create index if not exists posts_visibility_idx on public.posts (visibility);

