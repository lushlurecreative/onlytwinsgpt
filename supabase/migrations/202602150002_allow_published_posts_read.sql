-- Allow consumers to read published posts while preserving creator-owned access.

drop policy if exists "posts_select_published" on public.posts;
create policy "posts_select_published"
on public.posts
for select
to anon, authenticated
using (is_published = true);

