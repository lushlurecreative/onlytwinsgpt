-- Identity Models: versioned model registry for trained LoRA models
-- Each training run creates a new version; only one model per user is active at a time.

-- ============================================================
-- identity_models table
-- ============================================================
create table if not exists public.identity_models (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  subject_id uuid not null references public.subjects(id) on delete cascade,
  photo_set_id uuid null references public.training_photo_sets(id) on delete set null,
  training_job_id uuid null references public.training_jobs(id) on delete set null,

  -- versioning
  version integer not null default 1,
  status text not null default 'queued'
    check (status in ('queued', 'training', 'ready', 'failed', 'archived')),
  is_active boolean not null default false,

  -- model identity
  trigger_word text null,
  base_model text null default 'FLUX.1-dev',
  training_backend text null default 'runpod',

  -- artifact paths (set on completion)
  model_path text null,
  adapter_path text null,
  preview_image_path text null,

  -- training config (persisted from worker)
  training_steps integer null,
  network_dim integer null,
  network_alpha integer null,
  learning_rate numeric(10,8) null,
  caption_strategy text null,

  -- lifecycle timestamps
  started_at timestamptz null,
  completed_at timestamptz null,
  failure_reason text null,

  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

-- Indexes
create index if not exists identity_models_user_id_idx
  on public.identity_models(user_id);
create index if not exists identity_models_subject_id_idx
  on public.identity_models(subject_id);
create index if not exists identity_models_training_job_id_idx
  on public.identity_models(training_job_id);
create index if not exists identity_models_status_idx
  on public.identity_models(status);
-- Enforce exactly one active model per user at the database level
create unique index if not exists identity_models_one_active_per_user
  on public.identity_models(user_id) where is_active = true;

-- ============================================================
-- updated_at trigger
-- ============================================================
create or replace function public.set_identity_models_updated_at()
returns trigger as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$ language plpgsql;

drop trigger if exists identity_models_set_updated_at on public.identity_models;
create trigger identity_models_set_updated_at
  before update on public.identity_models
  for each row execute function public.set_identity_models_updated_at();

-- ============================================================
-- RLS policies
-- ============================================================
alter table public.identity_models enable row level security;

create policy "service_role_full_access_identity_models"
  on public.identity_models
  for all
  to service_role
  using (true)
  with check (true);

create policy "users_select_own_identity_models"
  on public.identity_models
  for select
  to authenticated
  using (auth.uid() = user_id);

-- Users should not insert/update/delete directly — managed by server
-- Only service_role can write.

-- ============================================================
-- Atomic RPC: activate a model (deactivate others + activate target in one transaction)
-- ============================================================
create or replace function public.activate_identity_model(
  p_model_id uuid,
  p_user_id uuid
) returns void as $$
begin
  -- Deactivate all active models for this user
  update public.identity_models
    set is_active = false, updated_at = timezone('utc', now())
    where user_id = p_user_id and is_active = true;

  -- Activate the target model
  update public.identity_models
    set is_active = true, updated_at = timezone('utc', now())
    where id = p_model_id and user_id = p_user_id and status = 'ready';
end;
$$ language plpgsql security definer;
