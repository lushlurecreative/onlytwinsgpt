-- Run in Supabase SQL Editor so Admin can see subjects and users can create them.
-- 1) Grant API access to the table
-- 2) RLS so service_role sees all, authenticated can manage own

grant all on public.subjects to service_role;
grant select, insert, update on public.subjects to authenticated;

alter table public.subjects enable row level security;

drop policy if exists "Service role full access on subjects" on public.subjects;
create policy "Service role full access on subjects"
  on public.subjects for all to service_role using (true) with check (true);

drop policy if exists "Users can read own subjects" on public.subjects;
create policy "Users can read own subjects"
  on public.subjects for select to authenticated using (auth.uid() = user_id);

drop policy if exists "Users can insert own subjects" on public.subjects;
create policy "Users can insert own subjects"
  on public.subjects for insert to authenticated with check (auth.uid() = user_id);

drop policy if exists "Users can update own subjects" on public.subjects;
create policy "Users can update own subjects"
  on public.subjects for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
