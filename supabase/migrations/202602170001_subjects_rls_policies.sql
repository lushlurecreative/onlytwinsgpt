-- Allow backend (service_role) and API to read/write all subjects.
-- Run this in Supabase SQL Editor if admin cannot see subjects.

alter table public.subjects enable row level security;

-- Ensure service_role can do everything so admin page and API can see all rows
drop policy if exists "Service role full access on subjects" on public.subjects;
create policy "Service role full access on subjects"
  on public.subjects for all
  to service_role
  using (true)
  with check (true);

-- Allow authenticated users to read/update their own (for API routes that use user context)
drop policy if exists "Users can read own subjects" on public.subjects;
create policy "Users can read own subjects"
  on public.subjects for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "Users can insert own subjects" on public.subjects;
create policy "Users can insert own subjects"
  on public.subjects for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "Users can update own subjects" on public.subjects;
create policy "Users can update own subjects"
  on public.subjects for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
