-- Training Photo Sets & Training Photos
-- Tracks photo datasets for LoRA training with per-photo validation metadata

-- ============================================================
-- training_photo_sets: groups photos into a trainable dataset
-- ============================================================
create table if not exists public.training_photo_sets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'draft'
    check (status in ('draft', 'uploaded', 'validating', 'ready', 'rejected', 'training', 'trained', 'failed')),
  photo_count integer not null default 0,
  approved_count integer not null default 0,
  rejected_count integer not null default 0,
  cover_image_path text null,
  notes text null,
  quality_score numeric(4,2) null,
  validation_summary jsonb null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists training_photo_sets_user_id_idx
  on public.training_photo_sets(user_id);
create index if not exists training_photo_sets_status_idx
  on public.training_photo_sets(status);

-- ============================================================
-- training_photos: individual photos with validation metadata
-- ============================================================
create table if not exists public.training_photos (
  id uuid primary key default gen_random_uuid(),
  photo_set_id uuid not null references public.training_photo_sets(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  storage_path text not null,
  original_filename text null,
  mime_type text not null,
  width integer null,
  height integer null,
  file_size integer null,
  -- validation fields
  face_count integer null,
  quality_score numeric(4,2) null,
  is_blurry boolean null,
  is_duplicate boolean null,
  has_occlusion boolean null,
  pose_bucket text null,
  validation_status text not null default 'pending'
    check (validation_status in ('pending', 'passed', 'warned', 'failed')),
  validation_notes text null,
  -- approval
  approved boolean null,
  rejection_reason text null,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists training_photos_photo_set_id_idx
  on public.training_photos(photo_set_id);
create index if not exists training_photos_user_id_idx
  on public.training_photos(user_id);
create index if not exists training_photos_storage_path_idx
  on public.training_photos(storage_path);
create unique index if not exists training_photos_storage_path_uniq
  on public.training_photos(storage_path);

-- ============================================================
-- updated_at trigger for training_photo_sets
-- ============================================================
create or replace function public.set_training_photo_sets_updated_at()
returns trigger as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$ language plpgsql;

drop trigger if exists training_photo_sets_set_updated_at on public.training_photo_sets;
create trigger training_photo_sets_set_updated_at
  before update on public.training_photo_sets
  for each row execute function public.set_training_photo_sets_updated_at();

-- ============================================================
-- RLS: training_photo_sets
-- ============================================================
alter table public.training_photo_sets enable row level security;

-- service role bypasses RLS
create policy "service_role_full_access_training_photo_sets"
  on public.training_photo_sets
  for all
  to service_role
  using (true)
  with check (true);

-- users can read/insert/update their own sets
create policy "users_select_own_training_photo_sets"
  on public.training_photo_sets
  for select
  to authenticated
  using (auth.uid() = user_id);

create policy "users_insert_own_training_photo_sets"
  on public.training_photo_sets
  for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "users_update_own_training_photo_sets"
  on public.training_photo_sets
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ============================================================
-- RLS: training_photos
-- ============================================================
alter table public.training_photos enable row level security;

create policy "service_role_full_access_training_photos"
  on public.training_photos
  for all
  to service_role
  using (true)
  with check (true);

create policy "users_select_own_training_photos"
  on public.training_photos
  for select
  to authenticated
  using (auth.uid() = user_id);

create policy "users_insert_own_training_photos"
  on public.training_photos
  for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "users_update_own_training_photos"
  on public.training_photos
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "users_delete_own_training_photos"
  on public.training_photos
  for delete
  to authenticated
  using (auth.uid() = user_id);

-- ============================================================
-- Add photo_set_id FK to training_jobs for traceability
-- ============================================================
do $$ begin
  alter table public.training_jobs
    add column photo_set_id uuid null references public.training_photo_sets(id) on delete set null;
exception when duplicate_column then null;
end $$;

create index if not exists training_jobs_photo_set_id_idx
  on public.training_jobs(photo_set_id);
